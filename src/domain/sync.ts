import type {
  DailySelfStatus,
  Inspiration,
  Item,
  Task,
  TimeSlot,
} from './types';

/**
 * 实时同步的领域模型（P2 第一阶段：**只做内核，不接云**）。
 *
 * 🔴 架构定位：这是**平行于 `repositories/` 的一条通道**，不是替换仓储实现。
 * 本项目是**本地优先** —— IndexedDB 永远是唯一真相源，云端只是镜像。
 * 所以：
 * - 业务层照旧读写 `Repositories`，一次网络请求都不打；
 * - 同步在后台增量搬运差异，离线可用、断网可用、同步挂了也不影响使用；
 * - `CloudRepository.stub.ts` 那种「用云端实现替换 IndexedDB」是**另一条路**
 *   （云端当真相源），与本地优先不兼容，不要混为一谈。
 *
 * 本文件只有类型与常量，零运行时依赖。
 */

/* ------------------------------------------------------------------ */
/* 参与同步的实体                                                       */
/* ------------------------------------------------------------------ */

/**
 * 参与记录级同步的实体。
 *
 * 枚举刻意**不含** `day` / `itemImage` / `taskImage`：
 * - `Day` 没有 `updatedAt`（它只是「这天被访问过」的惰性标记），对端 `ensure()`
 *   即可重建，同步它没有意义；
 * - 两张图片表是二进制 Blob，不参与 LWW —— 强行同步会把「改一个标题」变成
 *   「传几 MB 图片」。它们走**内容 hash 去重 + 懒加载**，属于第二阶段。
 */
export type SyncEntity = 'item' | 'task' | 'timeSlot' | 'inspiration' | 'selfStatus';

/** 全部同步实体的稳定顺序。轮次处理按它走，保证行为可预测、可测试。 */
export const SYNC_ENTITIES: readonly SyncEntity[] = [
  'item',
  'task',
  'timeSlot',
  'inspiration',
  'selfStatus',
];

/** 一条可被同步的记录（都是纯文本行，可安全 JSON 序列化） */
export type SyncRecord = Item | Task | TimeSlot | Inspiration | DailySelfStatus;

/* ------------------------------------------------------------------ */
/* 传输模型                                                            */
/* ------------------------------------------------------------------ */

/**
 * 云端的一行。
 *
 * 🔴 时间轴约定（这是最容易出错的地方，务必看清楚）：
 * **上了网就一律是服务端时间轴** —— `updatedAt` / `deletedAt` 以及
 * `record` 内部的同名字段，在推送前都由发送方换算到服务端轴；接收方落库时
 * 再按自己的 `serverTimeOffset` 平移回本地轴。
 *
 * 为什么必须这么绕：手机时钟不准是常态。若各设备把自己本地时间戳直接当排序键，
 * 一台快一小时的设备写的东西会永远压过慢的设备，同步就变成了「谁的钟快谁说了算」。
 * 统一到服务端轴后，任意两台设备独立计算都会得到同一个顺序 —— 这是**收敛**的前提。
 *
 * 为什么不让 `record.updatedAt` 直接当排序键：软删**只改 `deletedAt`**，
 * `updatedAt` 不变（这是「撤销」能完整恢复的前提）。若以 `updatedAt` 为游标，
 * 一次删除永远推不上去，对端的那条记录就会被复活 —— 本地优先同步最经典的翻车点。
 * 所以排序键是 `syncStamp()`：`max(updatedAt, deletedAt)`。
 */
export interface SyncRow {
  entity: SyncEntity;
  /** 记录主键（selfStatus 用日期键） */
  id: string;
  /** 服务端轴：`syncStamp(record)` 换算而来，云端按它排序与过滤 */
  updatedAt: number;
  /** 服务端轴；null 表示未删除 */
  deletedAt: number | null;
  /** 最后写入这条记录的设备，用于时间戳相等时的收敛兜底 */
  deviceId: string;
  /** 整行负载（jsonb 存整行，后续加字段不用动云端表结构） */
  record: SyncRecord;
}

/** 一次 pull 的结果（分页） */
export interface SyncPullPage {
  rows: SyncRow[];
  /** 服务端当前时间，用于校准本地时钟偏移 */
  serverTime: number;
  /** true 表示已到末尾（没有更多变更） */
  done: boolean;
}

/** 一次 push 的结果 */
export interface SyncPushAck {
  serverTime: number;
  /** 云端实际接受的行数 */
  applied: number;
}

/* ------------------------------------------------------------------ */
/* 本地同步状态                                                        */
/* ------------------------------------------------------------------ */

/**
 * 本设备的同步状态（落在 `syncMeta` 表，key = 'state'）。
 *
 * 两个游标都记**服务端时间轴**，绝不用本地 `Date.now()` 当游标 ——
 * 手机时钟不准是常态，用本地时间当游标会直接导致漏同步。
 */
export interface SyncState {
  /** 本设备 id，首次生成后永不变；LWW 平局时靠它收敛 */
  deviceId: string;
  /** 已登录用户 id；null 表示未开启同步 */
  userId: string | null;
  /** 已拉取到的服务端时间（pull 游标） */
  lastPulledAt: number;
  /** 已推送到的服务端时间（push 游标） */
  lastPushedAt: number;
  /** `serverTime - localTime`，本地 ↔ 服务端时间轴换算用 */
  serverTimeOffset: number;
}

export const DEFAULT_SYNC_STATE: Omit<SyncState, 'deviceId'> = {
  userId: null,
  lastPulledAt: 0,
  lastPushedAt: 0,
  serverTimeOffset: 0,
};

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/**
 * pull 的重叠窗口（毫秒）。
 *
 * 云端写入有提交延迟：一轮同步里「A 刚写进去但还没可见」的行，
 * 若游标精确停在最后一条的时间上，下一轮就永远拉不到它。
 * 每次往回退 5 秒重复拉一小段，代价极小，换来的是不会漏。
 */
export const PULL_OVERLAP_MS = 5_000;

/** push / pull 单批条数。日程类数据几千行量级，500 一批足够，也避免请求体过大。 */
export const SYNC_BATCH_SIZE = 500;

/** 单轮 pull 的页数上限，防止云端 `done` 永远为 false 时把客户端钉死在循环里 */
export const MAX_PULL_PAGES = 50;

/**
 * 排序键：`max(updatedAt, deletedAt)`（本地轴）。
 *
 * 见 `SyncRow` 的时间轴约定 —— 删除必须能被这个键「看见」，否则推不上去。
 */
export function syncStamp(record: Pick<SyncRecord, 'updatedAt'> & {
  deletedAt?: number | null;
}): number {
  return Math.max(record.updatedAt, record.deletedAt ?? 0);
}

/* ------------------------------------------------------------------ */
/* 冲突裁决（纯函数，本地端与云端**共用同一份**）                        */
/* ------------------------------------------------------------------ */

/**
 * 裁决结果：`local` / `remote` 表示谁胜出，`same` 表示无需落库。
 *
 * `local` / `remote` 是**调用方的视角**，不是「客户端 / 服务端」——
 * 云端用同一个函数裁决两台设备推上来的行，语义完全一致。
 */
export type ConflictWinner = 'local' | 'remote' | 'same';

/** 参与比较的时间字段，两端必须**已换算到同一时间轴** */
export interface ConflictStamp {
  updatedAt: number;
  deletedAt: number | null;
}

/**
 * 记录级 LWW（last-write-wins）。
 *
 * 规则按优先级：
 * 1. **删除优先于修改** —— 一方的删除时刻不早于另一方的最后修改时刻时，删除胜出；
 *    双方都删则**早的那个**胜（它是「原始删除」，另一条只是重复删）。
 *    反过来，若一方在对方删除**之后**又编辑了，那是明确的「我要把它找回来」，修改胜。
 * 2. 否则比最后修改时间，大者胜。
 * 3. 时间戳完全相同：用 `deviceId` 字典序兜底 —— 保证任意两台设备独立计算
 *    都会得到**同一个**赢家，否则两端会来回覆盖，永远不收敛。
 * 4. 时间戳与设备都相同：同一台设备写的同一行，判 `same`，不落库。
 *
 * ⚠️ 不做字段级合并（那要给每个字段记时间戳，复杂度高一个量级）。
 * 已知取舍：两端同时重排顺序时 `order` 以后写为准，可能出现跳变 ——
 * 重排是单端低频操作，接受。
 */
export function resolveSyncConflict(
  local: ConflictStamp,
  remote: ConflictStamp,
  localDeviceId: string,
  remoteDeviceId: string,
): ConflictWinner {
  const remoteDeleteWins =
    remote.deletedAt !== null && local.updatedAt <= (remote.deletedAt as number);
  const localDeleteWins =
    local.deletedAt !== null && remote.updatedAt <= (local.deletedAt as number);

  if (remoteDeleteWins && localDeleteWins) {
    const remoteDeletedAt = remote.deletedAt as number;
    const localDeletedAt = local.deletedAt as number;
    if (remoteDeletedAt !== localDeletedAt) {
      return remoteDeletedAt < localDeletedAt ? 'remote' : 'local';
    }
    return tieBreakByDevice(localDeviceId, remoteDeviceId);
  }
  if (remoteDeleteWins) return 'remote';
  if (localDeleteWins) return 'local';

  if (local.updatedAt !== remote.updatedAt) {
    return local.updatedAt > remote.updatedAt ? 'local' : 'remote';
  }
  return tieBreakByDevice(localDeviceId, remoteDeviceId);
}

/** 字典序小的设备胜出；同一设备返回 same（同一台机器写的同一行，无需覆盖） */
function tieBreakByDevice(localDeviceId: string, remoteDeviceId: string): ConflictWinner {
  if (localDeviceId === remoteDeviceId) return 'same';
  return localDeviceId < remoteDeviceId ? 'local' : 'remote';
}

/** 云端行的存储键 */
export function syncRowKey(entity: SyncEntity, id: string): string {
  return `${entity}:${id}`;
}
