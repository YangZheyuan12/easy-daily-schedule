import { describe, expect, it } from 'vitest';
import {
  applySlotSync,
  collectSyncedSlotIds,
  createSyncedSlotItems,
  planSlotSync,
} from '../slotSyncService';
import { createFixedClock } from '../clock';
import { makeItem, makeSlot } from './fixtures';

const DATE = '2026-10-10';
const clock = createFixedClock(5000);

describe('planSlotSync — 哪些时间段该同步', () => {
  it('归了板块的时间段进 create，各归各的板块', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'study', content: '上课' }),
    ];
    const plan = planSlotSync(slots, [], DATE);
    expect(plan.create.map((d) => [d.sectionId, d.title])).toEqual([
      ['work', '开组会'],
      ['study', '上课'],
    ]);
    expect(plan.update).toHaveLength(0);
  });

  it('没归板块的时间段不能同步（今日页条目必须落在某个板块下）', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: null, content: '睡了一觉' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'life', content: '买菜' }),
    ];
    expect(planSlotSync(slots, [], DATE).create.map((d) => d.slotId)).toEqual(['s2']);
  });

  it('软删的时间段不进计划', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '旧事' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'work', deletedAt: 999 }),
    ];
    expect(planSlotSync(slots, [], DATE).create.map((d) => d.slotId)).toEqual(['s1']);
  });

  it('内容为空的时段不进计划（否则今日页会多出「未命名条目」）', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '   ' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'work', content: ' 写周报 ' }),
    ];
    const plan = planSlotSync(slots, [], DATE);
    expect(plan.create.map((d) => d.slotId)).toEqual(['s2']);
    expect(plan.create[0]?.title).toBe('写周报');
  });

  it('负向：别天的时段不会被同步进来（contract 是「某一天」）', () => {
    const slots = [makeSlot({ id: 's1', date: '2026-10-11', sectionId: 'work', content: '明天的事' })];
    expect(planSlotSync(slots, [], DATE).create).toHaveLength(0);
  });

  it('已完成时段的 done 会跟随过去', () => {
    const slots = [makeSlot({ id: 's1', date: DATE, sectionId: 'work', done: true })];
    expect(planSlotSync(slots, [], DATE).create[0]?.done).toBe(true);
  });

  it('只同步**勾选的**：没勾的时段即使归了板块也不进计划', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '勾了的' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'work', content: '没勾的' }),
    ];
    // 组件只把勾选的传进来 —— 这里模拟「只勾了 s1」
    expect(planSlotSync([slots[0]!], [], DATE).create.map((d) => d.slotId)).toEqual(['s1']);
  });

  it('已同步过**且内容一致** → 不新建也不更新（按钮写几项、落地就得动几项）', () => {
    const slots = [makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会' })];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '开组会', sourceSlotId: 's1' }),
    ];
    const plan = planSlotSync(slots, items, DATE);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
  });

  it('已同步过**但换了分组** → 走 update，跟着时间轴改板块', () => {
    const slots = [makeSlot({ id: 's1', date: DATE, sectionId: 'study', content: '开组会' })];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '开组会', sourceSlotId: 's1' }),
    ];
    const plan = planSlotSync(slots, items, DATE);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toEqual([
      { itemId: 'i1', slotId: 's1', sectionId: 'study', title: '开组会', done: false },
    ]);
  });

  it('已同步过**但时间在时间轴改了标题 / 完成态** → 走 update', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会（改）', done: true }),
    ];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '开组会', sourceSlotId: 's1' }),
    ];
    const plan = planSlotSync(slots, items, DATE);
    expect(plan.update[0]?.title).toBe('开组会（改）');
    expect(plan.update[0]?.done).toBe(true);
  });

  it('今日页那条被删掉后 → 重新进 create（同步得回来）', () => {
    const slots = [makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会' })];
    const items = [
      makeItem({
        id: 'i1',
        date: DATE,
        sectionId: 'work',
        sourceSlotId: 's1',
        deletedAt: 2000,
      }),
    ];
    const plan = planSlotSync(slots, items, DATE);
    expect(plan.create.map((d) => d.slotId)).toEqual(['s1']);
    expect(plan.update).toHaveLength(0);
  });
});

describe('applySlotSync — 落地', () => {
  it('新建与更新可以同批落地，counts 分别返回', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '新建的' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'study', content: '改分组的' }),
    ];
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '改分组的', sourceSlotId: 's2' }),
    ];
    const plan = planSlotSync(slots, items, DATE);
    const result = applySlotSync(items, plan, clock);

    expect(result.created).toHaveLength(1);
    expect(result.updated).toEqual(['i1']);
    const moved = result.items.find((i) => i.id === 'i1');
    expect(moved?.sectionId).toBe('study');
  });

  it('换了分组的条目挪到**新板块顶层末尾**（order 比该板块现有条目都大）', () => {
    const items = [
      makeItem({ id: 'i1', date: DATE, sectionId: 'work', title: '甲', sourceSlotId: 's1' }),
      makeItem({ id: 'i2', date: DATE, sectionId: 'study', order: 1000 }),
      makeItem({ id: 'i3', date: DATE, sectionId: 'study', order: 2000 }),
    ];
    const plan = {
      create: [],
      update: [
        { itemId: 'i1', slotId: 's1', sectionId: 'study' as const, title: '甲', done: false },
      ],
    };
    const result = applySlotSync(items, plan, clock);
    const moved = result.items.find((i) => i.id === 'i1');

    expect(moved?.sectionId).toBe('study');
    expect(moved!.order).toBeGreaterThan(2000);
  });

  it('内容没变则不写（不推进 updatedAt，也就不给同步多推一行）', () => {
    const items = [
      makeItem({
        id: 'i1',
        date: DATE,
        sectionId: 'work',
        title: '甲',
        sourceSlotId: 's1',
        updatedAt: 1000,
      }),
    ];
    const plan = {
      create: [],
      update: [
        { itemId: 'i1', slotId: 's1', sectionId: 'work' as const, title: '甲', done: false },
      ],
    };
    const result = applySlotSync(items, plan, clock);
    expect(result.updated).toHaveLength(0);
    expect(result.items[0]?.updatedAt).toBe(1000);
  });

  it('空计划不改任何东西', () => {
    const items = [makeItem({ id: 'i1', date: DATE })];
    const result = applySlotSync(items, { create: [], update: [] }, clock);
    expect(result.items).toHaveLength(1);
    expect(result.created).toHaveLength(0);
    expect(result.updated).toHaveLength(0);
  });
});

describe('collectSyncedSlotIds — 谁已经同步过', () => {
  it('收集存活条目的来源时段', () => {
    const items = [
      makeItem({ id: 'i1', date: DATE, sourceSlotId: 's1' }),
      makeItem({ id: 'i2', date: DATE, sourceSlotId: 's2', deletedAt: 2000 }),
      makeItem({ id: 'i3', date: DATE, sourceSlotId: null }),
    ];
    expect([...collectSyncedSlotIds(items)]).toEqual(['s1']);
  });

  it('可以按日期收窄', () => {
    const items = [
      makeItem({ id: 'i1', date: DATE, sourceSlotId: 's1' }),
      makeItem({ id: 'i2', date: '2026-10-11', sourceSlotId: 's2' }),
    ];
    expect([...collectSyncedSlotIds(items, DATE)]).toEqual(['s1']);
    expect([...collectSyncedSlotIds(items)]).toEqual(['s1', 's2']);
  });
});

describe('createSyncedSlotItems — 落成条目', () => {
  it('追加到对应板块顶层末尾，并带上 sourceSlotId 与 done', () => {
    const items = [makeItem({ id: 'i1', date: DATE, sectionId: 'work', order: 1000 })];
    const drafts = [
      { slotId: 's1', date: DATE, sectionId: 'work' as const, title: '开组会', done: true },
    ];
    const result = createSyncedSlotItems(items, drafts, clock);
    const created = result.items.find((i) => i.sourceSlotId === 's1');

    expect(created).toBeDefined();
    expect(created?.sectionId).toBe('work');
    expect(created?.title).toBe('开组会');
    expect(created?.done).toBe(true);
    // 末尾：比既有条目的 order 大
    expect(created!.order).toBeGreaterThan(1000);
    // 同步出的条目不带来源任务标记（两个来源字段互不污染）
    expect(created?.sourceTaskId).toBeNull();
    expect(result.newIds).toHaveLength(1);
  });

  it('多个板块各自归位，互不插队', () => {
    const drafts = [
      { slotId: 's1', date: DATE, sectionId: 'work' as const, title: '甲', done: false },
      { slotId: 's2', date: DATE, sectionId: 'life' as const, title: '乙', done: false },
    ];
    const result = createSyncedSlotItems([], drafts, clock);
    const created = result.items;

    expect(created.map((i) => [i.sectionId, i.title])).toEqual([
      ['work', '甲'],
      ['life', '乙'],
    ]);
    expect(created.every((i) => i.sourceSlotId !== null)).toBe(true);
  });
});
