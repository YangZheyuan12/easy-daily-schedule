import { describe, expect, it } from 'vitest';
import { computeRingData, computeSectionProgress, computeTaskProgress, toPercent } from '../progressService';
import { makeItem } from './fixtures';

describe('computeSectionProgress', () => {
  it('完成率只看顶层条目，子项不计入分母', () => {
    const items = [
      makeItem({ id: 't1', done: true, order: 1000 }),
      makeItem({ id: 't2', done: false, order: 2000 }),
      makeItem({ id: 'c1', parentId: 't1', level: 1, done: false }),
      makeItem({ id: 'c2', parentId: 't1', level: 1, done: false }),
      makeItem({ id: 'c3', parentId: 't1', level: 1, done: false }),
    ];
    const progress = computeSectionProgress(items, 'work');
    expect(progress.total).toBe(2);
    expect(progress.done).toBe(1);
    expect(progress.ratio).toBe(0.5);
  });

  it('空板块返回 0 而不是 NaN', () => {
    const progress = computeSectionProgress([], 'work');
    expect(progress.ratio).toBe(0);
    expect(progress.total).toBe(0);
  });

  it('预览只取顶层条目', () => {
    const items = [
      makeItem({ id: 't1', order: 1000 }),
      makeItem({ id: 'c1', parentId: 't1', level: 1 }),
      makeItem({ id: 't2', order: 2000 }),
      makeItem({ id: 't3', order: 3000 }),
    ];
    expect(computeSectionProgress(items, 'work').preview.map((i) => i.id)).toEqual(['t1', 't2']);
  });

  it('只统计同板块的条目', () => {
    const items = [
      makeItem({ id: 'w', sectionId: 'work', done: true }),
      makeItem({ id: 's', sectionId: 'study', done: false }),
    ];
    expect(computeSectionProgress(items, 'work').ratio).toBe(1);
    expect(computeSectionProgress(items, 'study').ratio).toBe(0);
  });
});

describe('computeRingData', () => {
  it('总完成率用加权口径，而非四板块百分比的平均', () => {
    const items = [
      // 工作：1/1 → 100%
      makeItem({ id: 'w1', sectionId: 'work', done: true }),
      // 学习：0/9 → 0%
      ...Array.from({ length: 9 }, (_, i) =>
        makeItem({ id: `s${i}`, sectionId: 'study', done: false, order: (i + 1) * 1000 }),
      ),
    ];
    const ring = computeRingData(items);
    // 算术平均会是 50%，加权口径应为 1/10 = 10%
    expect(ring.overall).toBeCloseTo(0.1, 5);
  });

  it('没有任何条目时标记为空状态', () => {
    const ring = computeRingData([]);
    expect(ring.isEmpty).toBe(true);
    expect(ring.overall).toBe(0);
    expect(ring.segments).toHaveLength(4);
  });

  it('输出四个板块的分段，颜色与板块一致', () => {
    const ring = computeRingData([makeItem({ id: 'w1', sectionId: 'work', done: true })]);
    expect(ring.segments.map((s) => s.sectionId)).toEqual(['work', 'study', 'fitness', 'life']);
    expect(ring.segments[0]?.color).toBe('#3B82F6');
  });
});

describe('computeTaskProgress / toPercent', () => {
  it('任务完成度', () => {
    const result = computeTaskProgress([{ done: true }, { done: false }, { done: false }]);
    expect(result).toEqual({ done: 1, total: 3, ratio: 1 / 3 });
  });

  it('空任务列表返回 0', () => {
    expect(computeTaskProgress([]).ratio).toBe(0);
  });

  it('百分比取整避免浮点噪声', () => {
    expect(toPercent(1 / 3)).toBe(33);
    expect(toPercent(0)).toBe(0);
    expect(toPercent(1)).toBe(100);
  });
});
