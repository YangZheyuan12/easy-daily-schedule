import { describe, expect, it } from 'vitest';
import { inheritUnfinishedTasks } from '../inheritService';
import { createFixedClock } from '../clock';
import { makeTask } from './fixtures';

const clock = createFixedClock(9000);

const yesterday = [
  makeTask({ id: 'y1', content: '写周报', done: false, order: 1000 }),
  makeTask({ id: 'y2', content: '读论文', done: false, order: 2000 }),
  makeTask({ id: 'y3', content: '已完成的事', done: true, order: 3000 }),
  makeTask({ id: 'y4', content: '已删除的事', done: false, deletedAt: 100, order: 4000 }),
];

describe('inheritUnfinishedTasks', () => {
  it('只继承未完成、未删除的任务', () => {
    const { created } = inheritUnfinishedTasks([], yesterday, '2026-10-11', clock);
    expect(created.map((t) => t.content)).toEqual(['写周报', '读论文']);
  });

  it('新建任务带 inheritedFrom，便于溯源', () => {
    const { created } = inheritUnfinishedTasks([], yesterday, '2026-10-11', clock);
    expect(created[0]?.inheritedFrom).toBe('y1');
    expect(created[0]?.date).toBe('2026-10-11');
    expect(created[0]?.done).toBe(false);
  });

  it('连点 3 次不产生重复（幂等）', () => {
    let today = inheritUnfinishedTasks([], yesterday, '2026-10-11', clock).created;
    const countAfterFirst = today.length;

    today = [...today, ...inheritUnfinishedTasks(today, yesterday, '2026-10-11', clock).created];
    today = [...today, ...inheritUnfinishedTasks(today, yesterday, '2026-10-11', clock).created];

    expect(countAfterFirst).toBe(2);
    expect(today).toHaveLength(2);
  });

  it('今日已有相同内容的未完成任务时跳过（内容去重）', () => {
    const today = [makeTask({ id: 't1', content: '写周报', done: false })];
    const { created, skipped } = inheritUnfinishedTasks(today, yesterday, '2026-10-11', clock);
    expect(created.map((t) => t.content)).toEqual(['读论文']);
    expect(skipped).toBe(1);
  });

  it('今日该任务已完成时仍会继承（因为没完成的是昨天的安排）', () => {
    const today = [makeTask({ id: 't1', content: '写周报', done: true })];
    const { created } = inheritUnfinishedTasks(today, yesterday, '2026-10-11', clock);
    expect(created.map((t) => t.content)).toEqual(['写周报', '读论文']);
  });

  it('新任务排在今日已有任务之后', () => {
    const today = [makeTask({ id: 't0', content: '今天的新事', order: 1000 })];
    const { created } = inheritUnfinishedTasks(today, yesterday, '2026-10-11', clock);
    expect(created[0]?.order).toBeGreaterThan(1000);
  });

  it('昨日无未完成任务时不产生任何新任务', () => {
    const allDone = yesterday.map((t) => ({ ...t, done: true }));
    const { created, skipped } = inheritUnfinishedTasks([], allDone, '2026-10-11', clock);
    expect(created).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});
