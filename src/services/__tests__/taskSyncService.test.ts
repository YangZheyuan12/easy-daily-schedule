import { describe, expect, it } from 'vitest';
import {
  applyTaskSync,
  collectSyncedTaskIds,
  createSyncedItems,
  planTaskSync,
} from '../taskSyncService';
import { createFixedClock } from '../clock';
import { makeItem, makeTask } from './fixtures';

const DATE = '2026-10-10';
const clock = createFixedClock(5000);

describe('planTaskSync — 哪些任务该同步', () => {
  it('四大分组的任务进 create，各归各的板块', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'study', content: '背单词' }),
    ];
    const plan = planTaskSync(tasks, [], DATE);
    expect(plan.create.map((d) => [d.sectionId, d.title])).toEqual([
      ['work', '开组会'],
      ['study', '背单词'],
    ]);
    expect(plan.update).toHaveLength(0);
  });

  it('「其他」分组不参与同步', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'other', content: '取快递' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'life', content: '买菜' }),
    ];
    expect(planTaskSync(tasks, [], DATE).create.map((d) => d.taskId)).toEqual(['t2']);
  });

  it('软删任务不进计划', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '旧事' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'work', deletedAt: 999 }),
    ];
    expect(planTaskSync(tasks, [], DATE).create.map((d) => d.taskId)).toEqual(['t1']);
  });

  it('内容为空的任务不进计划（否则今日页会多出一排「未命名条目」）', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '   ' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'work', content: ' 写周报 ' }),
    ];
    const plan = planTaskSync(tasks, [], DATE);
    expect(plan.create.map((d) => d.taskId)).toEqual(['t2']);
    // 标题顺手 trim
    expect(plan.create[0]?.title).toBe('写周报');
  });

  it('负向：别天的任务不会被同步进来（contract 是「某一天」）', () => {
    const tasks = [makeTask({ id: 't1', date: '2026-10-11', sectionId: 'work', content: '明天的事' })];
    expect(planTaskSync(tasks, [], DATE).create).toHaveLength(0);
  });

  it('已完成任务的 done 会跟随过去', () => {
    const tasks = [makeTask({ id: 't1', date: DATE, sectionId: 'work', done: true })];
    expect(planTaskSync(tasks, [], DATE).create[0]?.done).toBe(true);
  });

  it('只同步**勾选的**：没勾的任务即使归了板块也不进计划', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '勾了的' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'work', content: '没勾的' }),
    ];
    // 组件只把勾选的传进来 —— 这里模拟「只勾了 t1」
    expect(planTaskSync([tasks[0]!], [], DATE).create.map((d) => d.taskId)).toEqual(['t1']);
  });

  it('已同步过**且内容一致** → 不新建也不更新', () => {
    const tasks = [makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会' })];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '开组会', sourceTaskId: 't1' }),
    ];
    const plan = planTaskSync(tasks, items, DATE);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
  });

  it('已同步过**但在任务页改了分组** → 走 update（勾选即对齐）', () => {
    const tasks = [makeTask({ id: 't1', date: DATE, sectionId: 'life', content: '开组会' })];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '开组会', sourceTaskId: 't1' }),
    ];
    const plan = planTaskSync(tasks, items, DATE);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toEqual([
      { itemId: 'i1', taskId: 't1', sectionId: 'life', title: '开组会', done: false },
    ]);
  });

  it('今日页那条被删掉后 → 重新进 create', () => {
    const tasks = [makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会' })];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', sourceTaskId: 't1', deletedAt: 2000 }),
    ];
    const plan = planTaskSync(tasks, items, DATE);
    expect(plan.create.map((d) => d.taskId)).toEqual(['t1']);
    expect(plan.update).toHaveLength(0);
  });
});

describe('applyTaskSync — 落地', () => {
  it('新建与更新同批落地', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '新建的' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'study', content: '改分组的' }),
    ];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '改分组的', sourceTaskId: 't2' }),
    ];
    const plan = planTaskSync(tasks, items, DATE);
    const result = applyTaskSync(items, plan, clock);

    expect(result.created).toHaveLength(1);
    expect(result.updated).toEqual(['i1']);
    expect(result.items.find((i) => i.id === 'i1')?.sectionId).toBe('study');
  });

  it('改了分组的条目 order 推到顶层末尾（不会带着旧板块的排序值插队）', () => {
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '甲', sourceTaskId: 't1' }),
      makeItem({ id: 'i2', date: DATE, sectionId: 'life', order: 1000 }),
      makeItem({ id: 'i3', date: DATE, sectionId: 'life', order: 2000 }),
    ];
    const result = applyTaskSync(
      items,
      {
        create: [],
        update: [
          { itemId: 'i1', taskId: 't1', sectionId: 'life', title: '甲', done: false },
        ],
      },
      clock,
    );
    const moved = result.items.find((i) => i.id === 'i1');
    expect(moved?.sectionId).toBe('life');
    expect(moved!.order).toBeGreaterThan(2000);
  });

  it('内容没变则不写（不推进 updatedAt）', () => {
    const items = [
      makeItem({
        id: 'i1',
        date: DATE,
        sectionId: 'work',
        title: '甲',
        sourceTaskId: 't1',
        updatedAt: 1000,
      }),
    ];
    const result = applyTaskSync(
      items,
      {
        create: [],
        update: [{ itemId: 'i1', taskId: 't1', sectionId: 'work', title: '甲', done: false }],
      },
      clock,
    );
    expect(result.updated).toHaveLength(0);
    expect(result.items[0]?.updatedAt).toBe(1000);
  });
});

describe('collectSyncedTaskIds — 谁已经同步过', () => {
  it('只收集存活条目的来源任务', () => {
    const items = [
      makeItem({ id: 'i1', date: DATE, sourceTaskId: 't1' }),
      makeItem({ id: 'i2', date: DATE, sourceTaskId: 't2', deletedAt: 2000 }),
      makeItem({ id: 'i3', date: DATE, sourceTaskId: null }),
    ];
    expect([...collectSyncedTaskIds(items)]).toEqual(['t1']);
  });
});

describe('createSyncedItems — 落成条目', () => {
  it('追加到对应板块顶层末尾，并带上 sourceTaskId 与 done', () => {
    const items = [makeItem({ id: 'i1', date: DATE, sectionId: 'work', order: 1000 })];
    const drafts = [
      { taskId: 't1', date: DATE, sectionId: 'work' as const, title: '开组会', done: true },
    ];
    const result = createSyncedItems(items, drafts, clock);
    const created = result.items.find((i) => i.sourceTaskId === 't1');

    expect(created).toBeDefined();
    expect(created?.sectionId).toBe('work');
    expect(created?.title).toBe('开组会');
    expect(created?.done).toBe(true);
    // 末尾：比既有条目的 order 大
    expect(created!.order).toBeGreaterThan(1000);
    // 不带来源时段标记（两个来源字段互不污染）
    expect(created?.sourceSlotId).toBeNull();
  });

  it('多条草稿各自落到自己的板块，order 递增（不会互相覆盖）', () => {
    const drafts = [
      { taskId: 't1', date: DATE, sectionId: 'work' as const, title: 'A', done: false },
      { taskId: 't2', date: DATE, sectionId: 'study' as const, title: 'B', done: false },
    ];
    const result = createSyncedItems([], drafts, clock);
    const a = result.items.find((i) => i.sourceTaskId === 't1');
    const b = result.items.find((i) => i.sourceTaskId === 't2');

    expect(a?.sectionId).toBe('work');
    expect(b?.sectionId).toBe('study');
    expect(b!.order).toBeGreaterThan(a!.order);
    expect(result.newIds).toHaveLength(2);
  });

  it('空草稿不产生任何条目（也不动原数组）', () => {
    const items = [makeItem({ id: 'i1', date: DATE })];
    const result = createSyncedItems(items, [], clock);
    expect(result.items).toHaveLength(1);
    expect(result.newIds).toHaveLength(0);
  });
});
