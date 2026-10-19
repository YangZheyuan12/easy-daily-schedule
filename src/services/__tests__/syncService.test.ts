import { beforeEach, describe, expect, it } from 'vitest';
import type { Repositories } from '@/domain/ports';
import type { DailySelfStatus, Inspiration, Item, Task, TimeSlot } from '@/domain/types';
import type { Clock } from '@/services/clock';
import { MemorySyncGateway } from '@/repositories/MemorySyncGateway';
import { MemorySyncStateRepository } from '@/repositories/IndexedDbSyncStateRepository';
import {
  calibrateOffset,
  planPullApply,
  planPush,
  runSyncRound,
  toLocalRecord,
  toLocalTime,
  toServerTime,
  toSyncRow,
  type SyncDeps,
} from '@/services/syncService';
import type { SyncEntity, SyncRecord } from '@/domain/sync';

/**
 * 同步内核的测试。
 *
 * 🔴 这批用例的价值在于：**不接任何后端也能把正确性锁死**。
 * 等真云端接进来，同一批断言可以直接复用，出问题就能断定是网关实现而不是内核。
 */

function makeItem(partial: Partial<Item> & { id: string }): Item {
  return {
    date: '2026-10-19',
    sectionId: 'work',
    parentId: null,
    title: '标题',
    level: 0,
    order: 1000,
    done: false,
    collapsed: false,
    description: '',
    rating: 0,
    review: '',
    createdAt: 100,
    updatedAt: 100,
    sourceTaskId: null,
    sourceSlotId: null,
    deletedAt: null,
    ...partial,
  };
}

/** 只实现本内核会用到的仓储方法，其余断言为 Repositories（其余方法不会被调用） */
function createMemoryRepos(deviceId: string): Repositories {
  const items = new Map<string, Item>();
  const bucket: { items: typeof items } = { items };

  return {
    items: {
      listAll: async () => [...bucket.items.values()],
      upsertMany: async (rows: Item[]) => {
        for (const row of rows) bucket.items.set(row.id, row);
      },
    },
    tasks: {
      listAll: async () => [] as Task[],
      upsertMany: async () => undefined,
    },
    timeSlots: {
      listAll: async () => [] as TimeSlot[],
      upsertMany: async () => undefined,
    },
    inspirations: {
      listAll: async () => [] as Inspiration[],
      upsertMany: async () => undefined,
    },
    selfStatus: {
      listAll: async () => [] as DailySelfStatus[],
      upsertMany: async () => undefined,
    },
    syncState: new MemorySyncStateRepository(deviceId),
  } as unknown as Repositories;
}

let baseNow = 1_700_000_000_000;

/** 一台「设备」：自己的库 + 自己的时钟（可带偏差）+ 自己的设备 id */
function createDevice(deviceId: string, localSkewMs = 0) {
  const repos = createMemoryRepos(deviceId);
  const clock: Clock = { now: () => baseNow + localSkewMs };
  return { deviceId, repos, clock };
}

function depsOf(device: ReturnType<typeof createDevice>, gateway: MemorySyncGateway): SyncDeps {
  return { repos: device.repos, gateway, clock: device.clock };
}

async function putItem(repos: Repositories, item: Item): Promise<void> {
  await repos.items.upsertMany([item]);
}

async function getItem(repos: Repositories, id: string): Promise<Item | undefined> {
  const all = (await repos.items.listAll()) as Item[];
  return all.find((row) => row.id === id);
}

beforeEach(() => {
  baseNow = 1_700_000_000_000;
});

/* ------------------------------------------------------------------ */

describe('时间轴换算', () => {
  it('本地 ↔ 服务端往返一致', () => {
    const offset = -3_600_000;
    expect(toLocalTime(toServerTime(5_000, offset), offset)).toBe(5_000);
  });

  it('校准偏移 = 服务端时间 − 本地时间', () => {
    expect(calibrateOffset(0, baseNow, baseNow + 3_600_000)).toBe(-3_600_000);
  });

  it('校准失败（非有限值）时保留旧值', () => {
    expect(calibrateOffset(-1, Number.NaN, baseNow)).toBe(-1);
  });
});

describe('toSyncRow', () => {
  it('把 record 与游标字段一起换算到服务端轴', () => {
    const row = toSyncRow('item', 'it_1', makeItem({ id: 'it_1', updatedAt: 1_000 }), 'dev_a', 500);
    expect(row.updatedAt).toBe(1_500);
    expect(row.record.updatedAt).toBe(1_500);
    expect(row.deletedAt).toBeNull();
  });

  it('🔴 软删行的 deletedAt 也换算，且 stamp 取 deletedAt', () => {
    const row = toSyncRow(
      'item',
      'it_1',
      makeItem({ id: 'it_1', updatedAt: 1_000, deletedAt: 2_000 }),
      'dev_a',
      500,
    );
    expect(row.deletedAt).toBe(2_500);
    expect(row.updatedAt).toBe(2_500);
    expect((row.record as Item).deletedAt).toBe(2_500);
  });

  it('落库时平移回本地轴，内容与原来一致', () => {
    const original = makeItem({ id: 'it_1', updatedAt: 1_000, deletedAt: 2_000 });
    const row = toSyncRow('item', 'it_1', original, 'dev_a', 500);
    const back = toLocalRecord(row, -700) as Item;
    expect(back.title).toBe(original.title);
    expect(back.updatedAt).toBe(2_200);
    expect(back.deletedAt).toBe(3_200);
  });
});

describe('planPush', () => {
  it('只带「游标之后」的变更', async () => {
    const device = createDevice('dev_a');
    await putItem(device.repos, makeItem({ id: 'old', updatedAt: 1_000 }));
    await putItem(device.repos, makeItem({ id: 'new', updatedAt: 3_000 }));

    const rows = await planPush(device.repos, { deviceId: 'dev_a', lastPushedAt: 2_000 }, 0);
    expect(rows.map((row) => row.id)).toEqual(['new']);
  });

  it('🔴 软删推得出去（stamp 用 deletedAt 而非 updatedAt）', async () => {
    const device = createDevice('dev_a');
    await putItem(device.repos, makeItem({ id: 'gone', updatedAt: 1_000, deletedAt: 5_000 }));

    // 若游标按 updatedAt 推进过 1000，这条删除就再也推不上去了 —— 正是这个用例要防的
    const rows = await planPush(device.repos, { deviceId: 'dev_a', lastPushedAt: 1_000 }, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0].deletedAt).toBe(5_000);
  });

  it('带上本设备 id，供对端平局兜底', async () => {
    const device = createDevice('dev_a');
    await putItem(device.repos, makeItem({ id: 'it_1', updatedAt: 1 }));
    const rows = await planPush(device.repos, { deviceId: 'dev_a', lastPushedAt: 0 }, 0);
    expect(rows[0].deviceId).toBe('dev_a');
  });
});

describe('planPullApply', () => {
  const offset = 0;

  function indexWith(record: SyncRecord, entity: SyncEntity, key: string) {
    return {
      item: new Map(entity === 'item' ? [[key, record]] : []),
      task: new Map(),
      timeSlot: new Map(),
      inspiration: new Map(),
      selfStatus: new Map(),
    } as unknown as Parameters<typeof planPullApply>[1];
  }

  it('本地没有这条 → 直接落库', () => {
    const row = toSyncRow('item', 'it_1', makeItem({ id: 'it_1', updatedAt: 10 }), 'dev_b', 0);
    const plan = planPullApply([row], indexWith({} as SyncRecord, 'task', 'x'), 'dev_a', offset);
    expect(plan.buckets.item).toHaveLength(1);
    expect(plan.skipped).toBe(0);
  });

  it('远端更新 → 落库', () => {
    const local = makeItem({ id: 'it_1', updatedAt: 10, title: '本地' });
    const row = toSyncRow(
      'item',
      'it_1',
      makeItem({ id: 'it_1', updatedAt: 20, title: '远端' }),
      'dev_b',
      0,
    );
    const plan = planPullApply([row], indexWith(local, 'item', 'it_1'), 'dev_a', offset);
    expect(plan.buckets.item).toHaveLength(1);
    expect((plan.buckets.item[0] as Item).title).toBe('远端');
  });

  it('本地更新 → 跳过（留到下一轮 push 带上去）', () => {
    const local = makeItem({ id: 'it_1', updatedAt: 30, title: '本地' });
    const row = toSyncRow(
      'item',
      'it_1',
      makeItem({ id: 'it_1', updatedAt: 20, title: '远端' }),
      'dev_b',
      0,
    );
    const plan = planPullApply([row], indexWith(local, 'item', 'it_1'), 'dev_a', offset);
    expect(plan.buckets.item).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it('同一批里重复的行只落一次（索引随落库同步推进）', () => {
    const row = toSyncRow('item', 'it_1', makeItem({ id: 'it_1', updatedAt: 20 }), 'dev_b', 0);
    const plan = planPullApply([row, row], indexWith({} as SyncRecord, 'task', 'x'), 'dev_a', offset);
    // 第二条会命中刚落库的索引，时间戳相同、设备相同 → same → 跳过
    expect(plan.buckets.item).toHaveLength(1);
    expect(plan.skipped).toBe(1);
  });

  it('落库的行被记录到 maxAppliedStamp，供 push 游标一起抬高', () => {
    const row = toSyncRow('item', 'it_1', makeItem({ id: 'it_1', updatedAt: 9_000 }), 'dev_b', 0);
    const plan = planPullApply([row], indexWith({} as SyncRecord, 'task', 'x'), 'dev_a', offset);
    expect(plan.maxAppliedStamp).toBe(9_000);
  });
});

/* ------------------------------------------------------------------ */

describe('runSyncRound', () => {
  it('A 推上去的，B 能拉下来', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const a = createDevice('dev_a');
    const b = createDevice('dev_b');

    await putItem(a.repos, makeItem({ id: 'it_1', title: '来自 A', updatedAt: 1_000 }));

    await runSyncRound(depsOf(a, gateway));
    const result = await runSyncRound(depsOf(b, gateway));

    expect(result.applied).toBe(1);
    expect((await getItem(b.repos, 'it_1'))?.title).toBe('来自 A');
  });

  it('🔴 两端各改一次 → 收敛到「后写的那个」', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const a = createDevice('dev_a');
    const b = createDevice('dev_b');

    const shared = makeItem({ id: 'it_1', title: '初始', updatedAt: 1_000 });
    await putItem(a.repos, shared);
    await runSyncRound(depsOf(a, gateway));
    await runSyncRound(depsOf(b, gateway));
    expect((await getItem(b.repos, 'it_1'))?.title).toBe('初始');

    baseNow += 1_000;
    await putItem(a.repos, { ...shared, title: 'A 改的', updatedAt: baseNow });
    await runSyncRound(depsOf(a, gateway));

    baseNow += 1_000;
    await putItem(b.repos, makeItem({ id: 'it_1', title: 'B 改的', updatedAt: baseNow }));
    await runSyncRound(depsOf(b, gateway));

    await runSyncRound(depsOf(a, gateway));
    const onA = await getItem(a.repos, 'it_1');
    const onB = await getItem(b.repos, 'it_1');
    expect(onA?.title).toBe('B 改的');
    expect(onB?.title).toBe(onA?.title);
  });

  it('🔴 一端删除，对端不会把它复活', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const a = createDevice('dev_a');
    const b = createDevice('dev_b');

    await putItem(a.repos, makeItem({ id: 'it_1', title: '待删', updatedAt: 1_000 }));
    await runSyncRound(depsOf(a, gateway));
    await runSyncRound(depsOf(b, gateway));
    expect((await getItem(b.repos, 'it_1'))?.deletedAt).toBeNull();

    baseNow += 5_000;
    await putItem(a.repos, makeItem({ id: 'it_1', title: '待删', updatedAt: 1_000, deletedAt: baseNow }));
    await runSyncRound(depsOf(a, gateway));
    await runSyncRound(depsOf(b, gateway));

    expect((await getItem(b.repos, 'it_1'))?.deletedAt).not.toBeNull();
  });

  it('🔴 时钟不准（B 快一小时）也能正确收敛', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const a = createDevice('dev_a', 0);
    const b = createDevice('dev_b', 3_600_000); // B 的钟快一小时

    await putItem(a.repos, makeItem({ id: 'it_1', title: '来自 A', updatedAt: baseNow }));
    await runSyncRound(depsOf(a, gateway));
    await runSyncRound(depsOf(b, gateway));
    expect((await getItem(b.repos, 'it_1'))?.title).toBe('来自 A');

    // B 在自己的时间轴上改动（数值比 A 的大一小时），仍应压过 A —— 靠的是偏移换算
    await putItem(b.repos, makeItem({ id: 'it_1', title: 'B 改的', updatedAt: baseNow + 3_600_000 + 1_000 }));
    await runSyncRound(depsOf(b, gateway));
    await runSyncRound(depsOf(a, gateway));

    expect((await getItem(a.repos, 'it_1'))?.title).toBe('B 改的');
  });

  it('没有新变更时第二轮不再重复推（游标已推进）', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const a = createDevice('dev_a');
    await putItem(a.repos, makeItem({ id: 'it_1', updatedAt: 1_000 }));

    const first = await runSyncRound(depsOf(a, gateway));
    const second = await runSyncRound(depsOf(a, gateway));

    expect(first.pushed).toBe(1);
    expect(second.pushed).toBe(0);
    // 重叠窗口决定「最近 5 秒的行会被重复拉一次」—— 这是刻意的，
    // 换来的是云端提交延迟不会漏数据。代价只是判一次 same，不落库。
    expect(second.applied).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it('🔴 不会把自己刚拉下来的又推回去（回环）', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const a = createDevice('dev_a');
    const b = createDevice('dev_b');

    await putItem(a.repos, makeItem({ id: 'it_1', updatedAt: 1_000 }));
    await runSyncRound(depsOf(a, gateway));

    // B 拉完之后立刻再跑一轮：不应产生任何推送
    await runSyncRound(depsOf(b, gateway));
    const again = await runSyncRound(depsOf(b, gateway));
    expect(again.pushed).toBe(0);
  });

  it('网关抛错时返回结果而非抛出，且已成功的游标得以保留', async () => {
    const gateway = new MemorySyncGateway({ now: () => baseNow });
    const failing = {
      pull: gateway.pull.bind(gateway),
      push: () => Promise.reject(new Error('网络不可用')),
    };
    const a = createDevice('dev_a');
    await putItem(a.repos, makeItem({ id: 'it_1', updatedAt: 1_000 }));

    const result = await runSyncRound({ repos: a.repos, gateway: failing, clock: a.clock });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('网络不可用');
    expect(result.pushed).toBe(0);
  });
});
