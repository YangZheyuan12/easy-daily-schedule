import type { Repositories, SyncGateway } from '@/domain/ports';
import type {
  DailySelfStatus,
  Inspiration,
  Item,
  Task,
  TimeSlot,
} from '@/domain/types';
import type {
  ConflictWinner,
  SyncEntity,
  SyncRecord,
  SyncRow,
  SyncState,
} from '@/domain/sync';
import {
  MAX_PULL_PAGES,
  PULL_OVERLAP_MS,
  SYNC_BATCH_SIZE,
  SYNC_ENTITIES,
  resolveSyncConflict,
  syncStamp,
} from '@/domain/sync';
import type { Clock } from './clock';

/**
 * 同步内核（本地优先）。
 *
 * 🔴 这里是**同步逻辑的全部**，且完全不认识网络、不认识浏览器 ——
 * 它只跟 `Repositories`（本地真相源）与 `SyncGateway`（差异搬运）两个接口打交道。
 * 接真后端时只需换一个 `SyncGateway` 实现，本文件一个字都不用改。
 *
 * 一轮同步 = **先 pull 再 push**，顺序不能反：
 * - 先 pull 才能拿到 `serverTime` 校准时钟偏移。用未校准的偏移去 push，
 *   等于给云端报一个错误的时间；
 * - 先 pull 才能把对端的改动并进本地，push 时推的是**合并后**的结果，
 *   否则会把旧值覆盖回去。
 *
 * 幂等性：任何一步中断都不会破坏数据（游标只在实际成功后推进），
 * 下一轮会从断点继续。代价是可能重复推几行，云端 LWW 会判为 `same` 拒掉。
 */

/* ------------------------------------------------------------------ */
/* 时间轴换算                                                          */
/* ------------------------------------------------------------------ */

/** 本地轴 → 服务端轴 */
export function toServerTime(localTime: number, offset: number): number {
  return localTime + offset;
}

/** 服务端轴 → 本地轴 */
export function toLocalTime(serverTime: number, offset: number): number {
  return serverTime - offset;
}

/* ------------------------------------------------------------------ */
/* 实体绑定                                                            */
/* ------------------------------------------------------------------ */

interface EntityBinding {
  entity: SyncEntity;
  listAll: () => Promise<SyncRecord[]>;
  upsert: (rows: SyncRecord[]) => Promise<void>;
  keyOf: (record: SyncRecord) => string;
}

/**
 * 实体 ↔ 仓储的绑定表。
 *
 * 写成一个函数而不是常量：仓储是运行时注入的，不能挂在模块级常量上。
 */
function createEntityBindings(repos: Repositories): EntityBinding[] {
  return [
    {
      entity: 'item',
      listAll: () => repos.items.listAll(),
      upsert: (rows) => repos.items.upsertMany(rows as Item[]),
      keyOf: (record) => (record as Item).id,
    },
    {
      entity: 'task',
      listAll: () => repos.tasks.listAll(),
      upsert: (rows) => repos.tasks.upsertMany(rows as Task[]),
      keyOf: (record) => (record as Task).id,
    },
    {
      entity: 'timeSlot',
      listAll: () => repos.timeSlots.listAll(),
      upsert: (rows) => repos.timeSlots.upsertMany(rows as TimeSlot[]),
      keyOf: (record) => (record as TimeSlot).id,
    },
    {
      entity: 'inspiration',
      listAll: () => repos.inspirations.listAll(),
      upsert: (rows) => repos.inspirations.upsertMany(rows as Inspiration[]),
      keyOf: (record) => (record as Inspiration).id,
    },
    {
      entity: 'selfStatus',
      listAll: () => repos.selfStatus.listAll(),
      upsert: (rows) => repos.selfStatus.upsertMany(rows as DailySelfStatus[]),
      // 自我状态的主键就是日期键，没有独立 id
      keyOf: (record) => (record as DailySelfStatus).date,
    },
  ];
}

type LocalIndex = Record<SyncEntity, Map<string, SyncRecord>>;

async function loadLocalIndex(bindings: EntityBinding[]): Promise<LocalIndex> {
  const index = emptyIndex();
  for (const binding of bindings) {
    const rows = await binding.listAll();
    for (const row of rows) index[binding.entity].set(binding.keyOf(row), row);
  }
  return index;
}

function emptyIndex(): LocalIndex {
  return {
    item: new Map(),
    task: new Map(),
    timeSlot: new Map(),
    inspiration: new Map(),
    selfStatus: new Map(),
  };
}

/* ------------------------------------------------------------------ */
/* 推送：算出「本地有哪些变更还没上去」                                  */
/* ------------------------------------------------------------------ */

/** 把本地行换算成待推送的云端行（服务端轴） */
export function toSyncRow(
  entity: SyncEntity,
  key: string,
  record: SyncRecord,
  deviceId: string,
  offset: number,
): SyncRow {
  const deletedAt =
    'deletedAt' in record && record.deletedAt != null
      ? toServerTime(record.deletedAt, offset)
      : null;
  return {
    entity,
    id: key,
    updatedAt: toServerTime(syncStamp(record), offset),
    deletedAt,
    deviceId,
    record: {
      ...record,
      updatedAt: toServerTime(record.updatedAt, offset),
      ...('deletedAt' in record ? { deletedAt } : null),
    } as SyncRecord,
  };
}

/**
 * 挑出需要推送的行：`syncStamp` 的服务端轴值 > 上次推送游标。
 *
 * 用 `syncStamp`（max(updatedAt, deletedAt)）而不是 `updatedAt`，
 * 是因为软删只改 `deletedAt` —— 只看 `updatedAt` 的话，
 * 一次删除永远推不上去，对端那条记录就会被复活。
 */
export async function planPush(
  repos: Repositories,
  state: Pick<SyncState, 'deviceId' | 'lastPushedAt'>,
  offset: number,
): Promise<SyncRow[]> {
  const bindings = createEntityBindings(repos);
  const rows: SyncRow[] = [];
  for (const binding of bindings) {
    const all = await binding.listAll();
    for (const record of all) {
      const stamp = toServerTime(syncStamp(record), offset);
      if (stamp <= state.lastPushedAt) continue;
      rows.push(toSyncRow(binding.entity, binding.keyOf(record), record, state.deviceId, offset));
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ */
/* 拉取：决定「对端哪些行要落到本地」                                    */
/* ------------------------------------------------------------------ */

export interface PullPlan {
  /** 按实体分桶，直接交给 upsertMany */
  buckets: Record<SyncEntity, SyncRecord[]>;
  /** 被本地否决的行数（本地更新） */
  skipped: number;
  /** 落库行的最大服务端 stamp，用于把 push 游标一起抬上去（避免回环重推） */
  maxAppliedStamp: number;
}

/** 把云端行平移回本地轴 */
export function toLocalRecord(row: SyncRow, offset: number): SyncRecord {
  return {
    ...row.record,
    updatedAt: toLocalTime(row.record.updatedAt, offset),
    ...('deletedAt' in row.record
      ? { deletedAt: row.deletedAt === null ? null : toLocalTime(row.deletedAt, offset) }
      : null),
  } as SyncRecord;
}

/**
 * 对一批云端行做冲突裁决，产出落库计划。
 *
 * `localIndex` 必须是**最新**的：调用方在落库后要把它一起更新，
 * 否则同一轮里的后续分页会拿着旧值反复比较。
 */
export function planPullApply(
  remoteRows: readonly SyncRow[],
  localIndex: LocalIndex,
  deviceId: string,
  offset: number,
): PullPlan {
  const plan: PullPlan = {
    buckets: { item: [], task: [], timeSlot: [], inspiration: [], selfStatus: [] },
    skipped: 0,
    maxAppliedStamp: 0,
  };

  for (const row of remoteRows) {
    const local = localIndex[row.entity].get(row.id);
    let winner: ConflictWinner = 'remote';
    if (local) {
      const localDeletedAt = 'deletedAt' in local ? local.deletedAt : null;
      winner = resolveSyncConflict(
        {
          updatedAt: toServerTime(local.updatedAt, offset),
          deletedAt: localDeletedAt == null ? null : toServerTime(localDeletedAt, offset),
        },
        { updatedAt: row.updatedAt, deletedAt: row.deletedAt },
        deviceId,
        row.deviceId,
      );
    }

    if (winner === 'local' || winner === 'same') {
      plan.skipped += 1;
      continue;
    }
    const record = toLocalRecord(row, offset);
    plan.buckets[row.entity].push(record);
    // 同步推进内存索引，保证同一轮后续分页看到的是刚落库的值
    localIndex[row.entity].set(row.id, record);
    if (row.updatedAt > plan.maxAppliedStamp) plan.maxAppliedStamp = row.updatedAt;
  }

  return plan;
}

async function applyPullPlan(repos: Repositories, plan: PullPlan): Promise<number> {
  const bindings = createEntityBindings(repos);
  let applied = 0;
  for (const binding of bindings) {
    const bucket = plan.buckets[binding.entity];
    if (bucket.length === 0) continue;
    await binding.upsert(bucket);
    applied += bucket.length;
  }
  return applied;
}

/* ------------------------------------------------------------------ */
/* 一轮同步                                                            */
/* ------------------------------------------------------------------ */

export interface SyncDeps {
  repos: Repositories;
  gateway: SyncGateway;
  clock: Clock;
}

export interface SyncRoundResult {
  ok: boolean;
  /** 从云端拉到的行数 */
  pulled: number;
  /** 真正写进本地的行数 */
  applied: number;
  /** 被本地否决的行数（本地更新，需要等下一轮 push 带上去） */
  skipped: number;
  /** 推上去的行数 */
  pushed: number;
  /** 本轮校准后的时钟偏移 */
  offset: number;
  error?: string;
}

/**
 * 跑一轮完整同步（pull 所有分页 → push 所有分批 → 推进游标）。
 *
 * 是否开启同步由上层（未来的 `syncStore`）判断；本函数不做登录态校验，
 * 这样内核可以脱离账号独立测试。
 */
export async function runSyncRound(deps: SyncDeps): Promise<SyncRoundResult> {
  const { repos, gateway, clock } = deps;
  let state = await repos.syncState.get();
  let offset = state.serverTimeOffset;

  const result: SyncRoundResult = {
    ok: true,
    pulled: 0,
    applied: 0,
    skipped: 0,
    pushed: 0,
    offset,
  };

  try {
    /* ---------- 1. pull ---------- */
    const localIndex = await loadLocalIndex(createEntityBindings(repos));
    // 重叠窗口：往回退一小段重复拉，兜住云端写入的提交延迟
    let since = Math.max(0, state.lastPulledAt - PULL_OVERLAP_MS);

    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      const res = await gateway.pull(since, SYNC_BATCH_SIZE);
      offset = calibrateOffset(offset, res.serverTime, clock.now());
      result.offset = offset;

      if (res.rows.length > 0) {
        const plan = planPullApply(res.rows, localIndex, state.deviceId, offset);
        result.applied += await applyPullPlan(repos, plan);
        result.skipped += plan.skipped;
        result.pulled += res.rows.length;

        let maxStamp = 0;
        for (const row of res.rows) if (row.updatedAt > maxStamp) maxStamp = row.updatedAt;
        if (maxStamp > state.lastPulledAt) state.lastPulledAt = maxStamp;
        // 刚从云端来的行，云端已经有了 —— push 游标一起抬上去，避免回环重推
        if (plan.maxAppliedStamp > state.lastPushedAt) {
          state.lastPushedAt = plan.maxAppliedStamp;
        }
        since = maxStamp;
      }

      if (res.done) break;
    }

    /* ---------- 2. push ---------- */
    const pending = await planPush(repos, state, offset);
    for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
      const batch = pending.slice(i, i + SYNC_BATCH_SIZE);
      const ack = await gateway.push(batch);
      offset = calibrateOffset(offset, ack.serverTime, clock.now());
      result.offset = offset;
      result.pushed += batch.length;
      let maxStamp = 0;
      for (const row of batch) if (row.updatedAt > maxStamp) maxStamp = row.updatedAt;
      // 只有成功推送后才推进游标 —— 中途失败下一轮会重试这批，不会丢
      if (maxStamp > state.lastPushedAt) state.lastPushedAt = maxStamp;
    }

    /* ---------- 3. 落盘游标 ---------- */
    state = await repos.syncState.patch({
      lastPulledAt: state.lastPulledAt,
      lastPushedAt: state.lastPushedAt,
      serverTimeOffset: offset,
    });
    return result;
  } catch (error) {
    // 失败了也要把已成功的部分固化：游标没推进的部分下一轮会重放，重复但不会错
    try {
      await repos.syncState.patch({
        lastPulledAt: state.lastPulledAt,
        lastPushedAt: state.lastPushedAt,
        serverTimeOffset: offset,
      });
    } catch {
      // 连状态都写不进去就没办法了，等下一轮
    }
    result.ok = false;
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

/**
 * 校准时钟偏移：`offset = serverTime - localNow`。
 *
 * 直接覆盖而不是取平均：网络往返带来的误差在几百毫秒量级，
 * 而 pull 有 5 秒重叠窗口兜底，不需要为这点抖动增加状态复杂度。
 */
export function calibrateOffset(current: number, serverTime: number, localNow: number): number {
  const next = serverTime - localNow;
  return Number.isFinite(next) ? next : current;
}

/** 供 UI / 上层判断：这批行里有没有实际落库的（决定要不要刷新列表） */
export function hasAppliedChanges(result: SyncRoundResult): boolean {
  return result.applied > 0;
}

/** 参与同步的实体清单（供上层遍历展示「同步范围」用） */
export const syncableEntities: readonly SyncEntity[] = SYNC_ENTITIES;
