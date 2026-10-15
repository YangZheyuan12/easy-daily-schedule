import { describe, expect, it } from 'vitest';
import { createSyncedSlotItems, planSlotSync } from '../slotSyncService';
import { createFixedClock } from '../clock';
import { makeItem, makeSlot } from './fixtures';

const DATE = '2026-10-10';
const clock = createFixedClock(5000);

describe('planSlotSync — 哪些时间段该同步', () => {
  it('归了板块的时间段进草稿，各归各的板块', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'study', content: '上课' }),
    ];
    const drafts = planSlotSync(slots, [], DATE);
    expect(drafts.map((d) => [d.sectionId, d.title])).toEqual([
      ['work', '开组会'],
      ['study', '上课'],
    ]);
  });

  it('没归板块的时间段不能同步（今日页条目必须落在某个板块下）', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: null, content: '睡了一觉' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'life', content: '买菜' }),
    ];
    expect(planSlotSync(slots, [], DATE).map((d) => d.slotId)).toEqual(['s2']);
  });

  it('软删的时间段不进草稿', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '旧事' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'work', deletedAt: 999 }),
    ];
    expect(planSlotSync(slots, [], DATE).map((d) => d.slotId)).toEqual(['s1']);
  });

  it('内容为空的时段不进草稿（否则今日页会多出「未命名条目」）', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '   ' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'work', content: ' 写周报 ' }),
    ];
    const drafts = planSlotSync(slots, [], DATE);
    expect(drafts.map((d) => d.slotId)).toEqual(['s2']);
    expect(drafts[0]?.title).toBe('写周报');
  });

  it('幂等：今日页已存在同来源条目时不再同步（点两次不会堆两份）', () => {
    const slots = [makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '开组会' })];
    const items = [makeItem({ id: 'i1', date: DATE, sectionId: 'work', sourceSlotId: 's1' })];
    expect(planSlotSync(slots, items, DATE)).toHaveLength(0);
  });

  it('负向：别天的时段不会被同步进来（contract 是「某一天」）', () => {
    const slots = [makeSlot({ id: 's1', date: '2026-10-11', sectionId: 'work', content: '明天的事' })];
    expect(planSlotSync(slots, [], DATE)).toHaveLength(0);
  });

  it('已完成时段的 done 会跟随过去', () => {
    const slots = [makeSlot({ id: 's1', date: DATE, sectionId: 'work', done: true })];
    expect(planSlotSync(slots, [], DATE)[0]?.done).toBe(true);
  });

  it('只同步**勾选的**：没勾的时段即使归了板块也不进草稿', () => {
    const slots = [
      makeSlot({ id: 's1', date: DATE, sectionId: 'work', content: '勾了的' }),
      makeSlot({ id: 's2', date: DATE, sectionId: 'work', content: '没勾的' }),
    ];
    // 组件只把勾选的传进来 —— 这里模拟「只勾了 s1」
    expect(planSlotSync([slots[0]!], [], DATE).map((d) => d.slotId)).toEqual(['s1']);
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
