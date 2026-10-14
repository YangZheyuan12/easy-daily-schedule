import { describe, expect, it } from 'vitest';
import { createSyncedItems, planTaskSync } from '../taskSyncService';
import { createFixedClock } from '../clock';
import { makeItem, makeTask } from './fixtures';

const DATE = '2026-10-10';
const clock = createFixedClock(5000);

describe('planTaskSync — 哪些任务该同步', () => {
  it('四大分组的任务进草稿，各归各的板块', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'study', content: '背单词' }),
    ];
    const drafts = planTaskSync(tasks, [], DATE);
    expect(drafts.map((d) => [d.sectionId, d.title])).toEqual([
      ['work', '开组会'],
      ['study', '背单词'],
    ]);
  });

  it('「其他」分组不参与同步', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'other', content: '取快递' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'life', content: '买菜' }),
    ];
    const drafts = planTaskSync(tasks, [], DATE);
    expect(drafts.map((d) => d.taskId)).toEqual(['t2']);
  });

  it('软删任务不进草稿', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '旧事' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'work', deletedAt: 999 }),
    ];
    expect(planTaskSync(tasks, [], DATE).map((d) => d.taskId)).toEqual(['t1']);
  });

  it('内容为空的任务不进草稿（否则今日页会多出一排「未命名条目」）', () => {
    const tasks = [
      makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '   ' }),
      makeTask({ id: 't2', date: DATE, sectionId: 'work', content: ' 写周报 ' }),
    ];
    const drafts = planTaskSync(tasks, [], DATE);
    expect(drafts.map((d) => d.taskId)).toEqual(['t2']);
    // 标题顺手 trim
    expect(drafts[0]?.title).toBe('写周报');
  });

  it('幂等：今日页已存在同来源条目时不再同步（点两次按钮不会堆两份）', () => {
    const tasks = [makeTask({ id: 't1', date: DATE, sectionId: 'work', content: '开组会' })];
    const items = [makeItem({ id: 'i1', date: DATE, sectionId: 'work', sourceTaskId: 't1' })];
    expect(planTaskSync(tasks, items, DATE)).toHaveLength(0);
  });

  it('负向：别天的任务不会被同步进来（contract 是「某一天」）', () => {
    const tasks = [makeTask({ id: 't1', date: '2026-10-11', sectionId: 'work', content: '明天的事' })];
    expect(planTaskSync(tasks, [], DATE)).toHaveLength(0);
  });

  it('已完成任务的 done 会跟随过去', () => {
    const tasks = [makeTask({ id: 't1', date: DATE, sectionId: 'work', done: true })];
    expect(planTaskSync(tasks, [], DATE)[0]?.done).toBe(true);
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
