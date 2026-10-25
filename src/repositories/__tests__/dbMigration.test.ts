import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { AppDatabase } from '@/repositories/db/DexieDatabase';
import { DB_VERSION } from '@/repositories/db/schema';
import { makeInspiration, makeSlot } from '@/services/__tests__/fixtures';

/**
 * v1 → v3 迁移验证（QA）。
 *
 * 升级最怕两件事：老数据没了、新表没建起来。这两件事都不会报错，
 * 只会表现为用户更新完 App 发现「以前的记录全空了」。
 * 所以这里手工造一个 v1 库（含 `reviews` 表）再让当前代码打开它，逐项核对。
 */
const V1_STORES = {
  items: '&id, date, sectionId, parentId, [date+sectionId], deletedAt',
  tasks: '&id, date, deletedAt, inheritedFrom',
  days: '&date',
  reviews: '&date',
} as const;

let counter = 0;

async function makeV1(): Promise<string> {
  const name = `migration-test-${counter++}`;
  const v1 = new Dexie(name);
  v1.version(1).stores(V1_STORES);
  await v1.open();
  await v1.table('items').put({
    id: 'i1',
    date: '2026-10-10',
    sectionId: 'work',
    parentId: null,
    title: 'v1 的条目',
    level: 0,
    order: 1000,
    done: true,
    collapsed: false,
    description: '',
    rating: 0,
    review: '',
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
  });
  await v1.table('tasks').put({
    id: 't1',
    date: '2026-10-10',
    content: 'v1 的任务',
    done: false,
    order: 1000,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    inheritedFrom: null,
  });
  await v1.table('days').put({ date: '2026-10-10', createdAt: 1 });
  await v1.table('reviews').put({ date: '2026-10-10', rating: 4, text: 'v1 的总评', updatedAt: 1 });
  v1.close();
  return name;
}

/**
 * 造一个 **v4 库**（缺 `taskImages`，但已有 `itemImages`）—— 这是绝大多数老用户
 * 升级时的真实处境。任务图片是 v5 新增的，迁移必须能把老 Picture 完整留下来。
 */
async function makeV4(): Promise<string> {
  const name = `migration-test-v4-${counter++}`;
  const v4 = new Dexie(name);
  v4.version(1).stores(V1_STORES);
  v4.version(4).stores({
    items: '&id, date, sectionId, parentId, [date+sectionId], deletedAt',
    tasks: '&id, date, deletedAt, inheritedFrom',
    days: '&date',
    selfStatus: '&date',
    timeSlots: '&id, date, [date+sectionId], deletedAt',
    inspirations: '&id, date, deletedAt',
    itemImages: '&id, itemId',
  });
  await v4.open();
  await v4.table('itemImages').put({
    id: 'img1',
    itemId: 'i1',
    blob: new Blob(['fake']),
    createdAt: 1,
  });
  v4.close();
  return name;
}

describe('Dexie v1 → v8 迁移', () => {
  it('当前 schema 版本号是 7', () => {
    expect(DB_VERSION).toBe(8);
  });

  it('v1 的三个老表（items / tasks / days）数据全部保留', async () => {
    const db = new AppDatabase(await makeV1());
    await db.open();

    expect(db.verno).toBe(8);

    const items = await db.items.toArray();
    const tasks = await db.tasks.toArray();
    const days = await db.days.toArray();

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('v1 的条目');
    expect(items[0]?.done).toBe(true);
    expect(tasks[0]?.content).toBe('v1 的任务');
    expect(days.map((day) => day.date)).toEqual(['2026-10-10']);

    db.close();
  });

  it('v2 起新增的 selfStatus / timeSlots / inspirations 三个表已建好且可读写', async () => {
    const db = new AppDatabase(await makeV1());
    await db.open();

    await db.selfStatus.put({
      date: '2026-10-10',
      mood: 4,
      moodText: '不错',
      body: 3,
      bodyText: '',
      updatedAt: 2,
    });
    await db.timeSlots.put(makeSlot({ id: 's1', date: '2026-10-10', content: '跳舞' }));
    await db.inspirations.put(makeInspiration({ id: 'in1', date: '2026-10-10', content: '想法' }));

    expect(await db.selfStatus.get('2026-10-10')).toMatchObject({ mood: 4, body: 3 });
    const slots = await db.timeSlots.where('date').equals('2026-10-10').toArray();
    expect(slots.map((slot) => slot.content)).toEqual(['跳舞']);
    const inspirations = await db.inspirations.where('date').equals('2026-10-10').toArray();
    expect(inspirations.map((row) => row.content)).toEqual(['想法']);

    db.close();
  });

  it('已废弃的 reviews 表不再存在于 schema（有意丢弃，不是漏建）', async () => {
    const db = new AppDatabase(await makeV1());
    await db.open();

    const names = db.tables.map((table) => table.name);
    expect(names).toContain('items');
    expect(names).toContain('tasks');
    expect(names).toContain('days');
    expect(names).toContain('selfStatus');
    expect(names).toContain('timeSlots');
    expect(names).toContain('inspirations');
    expect(names).not.toContain('reviews');

    db.close();
  });

  it('全新安装（无老库）直接用当前版本建库，十三张表齐全', async () => {
    const db = new AppDatabase(`fresh-install-${counter++}`);
    await db.open();

    expect(db.verno).toBe(8);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      'account',
      'days',
      'entitlements',
      'inspirations',
      'itemImages',
      'items',
      'routineCompletions',
      'routines',
      'selfStatus',
      'syncMeta',
      'taskImages',
      'tasks',
      'timeSlots',
    ]);
    expect(await db.items.count()).toBe(0);

    db.close();
  });

  /*
    老用户升级：v4 → v5 只多了 `taskImages` 一张表，已有的条目图片**必须原样保留**。
    这类回归一旦发生是不可逆的（图片没了就没了），所以单独钉一条用例。
  */
  it('v4 → v5：新增 taskImages 表，且老版 itemImages 里的图片一条不少', async () => {
    const db = new AppDatabase(await makeV4());
    await db.open();

    expect(db.verno).toBe(8);
    expect(db.tables.map((table) => table.name)).toContain('taskImages');

    const images = await db.itemImages.toArray();
    expect(images).toHaveLength(1);
    expect(images[0]?.id).toBe('img1');

    // 新表要能真正读写
    await db.taskImages.put({
      id: 'timg1',
      taskId: 't1',
      blob: new Blob(['fake']),
      createdAt: 2,
    });
    expect(await db.taskImages.count()).toBe(1);

    db.close();
  });

  /*
    同步内核（v6）：新增 `syncMeta` 表存 deviceId / 双游标 / 时钟偏移。
    它跟业务数据同库，这样「写完数据 + 推进游标」才能落在同一个事务里 ——
    分开放（比如 localStorage）就可能在写数据成功、游标失败之间崩掉，
    结果是下一轮重复推一整库。
  */
  it('v6：syncMeta 表建好且可读写（升级不影响既有业务表）', async () => {
    const db = new AppDatabase(await makeV4());
    await db.open();

    expect(db.verno).toBe(8);
    expect(db.tables.map((table) => table.name)).toContain('syncMeta');

    await db.syncMeta.put({
      key: 'state',
      deviceId: 'dev_1',
      userId: null,
      lastPulledAt: 0,
      lastPushedAt: 0,
      serverTimeOffset: 0,
    });
    const row = await db.syncMeta.get('state');
    expect(row?.deviceId).toBe('dev_1');

    // 老业务数据不能因为升版本而丢
    expect(await db.itemImages.count()).toBe(1);

    db.close();
  });
});
