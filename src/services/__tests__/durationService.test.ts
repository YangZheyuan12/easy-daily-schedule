import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  slotDurationMinutes,
  sumMinutesBySection,
  sumMonthMinutesBySection,
  totalMinutes,
  totalMonthMinutes,
} from '../durationService';
import { makeSlot } from './fixtures';

describe('slotDurationMinutes — 实际时间优先，回退计划时间', () => {
  it('只填了计划时间：用计划区间', () => {
    const slot = makeSlot({ id: 'a', startMin: 9 * 60, endMin: 10 * 60 + 30 });
    expect(slotDurationMinutes(slot)).toBe(90);
  });

  it('填了实际时间：用实际区间（计划再长也不算）', () => {
    const slot = makeSlot({
      id: 'a',
      startMin: 9 * 60,
      endMin: 12 * 60,
      actualStartMin: 9 * 60 + 10,
      actualEndMin: 10 * 60,
    });
    expect(slotDurationMinutes(slot)).toBe(50);
  });

  it('endMin = 0 是「未设定结束」，不是「0 点结束」—— 记 0 而不是负数', () => {
    const slot = makeSlot({ id: 'a', startMin: 9 * 60, endMin: 0 });
    expect(slotDurationMinutes(slot)).toBe(0);
  });

  it('区间倒置（结束早于开始）记 0，不产生负时长', () => {
    const slot = makeSlot({ id: 'a', startMin: 10 * 60, endMin: 9 * 60 });
    expect(slotDurationMinutes(slot)).toBe(0);
  });

  it('只有实际开始、没有实际结束：结束回退到计划结束', () => {
    const slot = makeSlot({
      id: 'a',
      startMin: 9 * 60,
      endMin: 11 * 60,
      actualStartMin: 9 * 60 + 30,
      actualEndMin: null,
    });
    expect(slotDurationMinutes(slot)).toBe(90);
  });
});

describe('sumMinutesBySection — 按板块汇总', () => {
  it('累加同板块的多条时间段', () => {
    const slots = [
      makeSlot({ id: 'a', sectionId: 'work', startMin: 9 * 60, endMin: 10 * 60 }),
      makeSlot({ id: 'b', sectionId: 'work', startMin: 14 * 60, endMin: 14 * 60 + 30 }),
      makeSlot({ id: 'c', sectionId: 'study', startMin: 20 * 60, endMin: 21 * 60 }),
    ];
    const sums = sumMinutesBySection(slots);
    expect(sums.work).toBe(90);
    expect(sums.study).toBe(60);
    expect(sums.fitness).toBe(0);
    expect(sums.life).toBe(0);
  });

  it('未归类（sectionId = null）的时间段不计入任何板块', () => {
    const sums = sumMinutesBySection([
      makeSlot({ id: 'a', sectionId: null, startMin: 9 * 60, endMin: 12 * 60 }),
    ]);
    expect(totalMinutes([makeSlot({ id: 'a', sectionId: null, startMin: 9 * 60, endMin: 12 * 60 })])).toBe(0);
    expect(Object.values(sums).every((v) => v === 0)).toBe(true);
  });

  it('软删的时间段不计入', () => {
    const sums = sumMinutesBySection([
      makeSlot({ id: 'a', sectionId: 'work', startMin: 9 * 60, endMin: 12 * 60, deletedAt: 5000 }),
    ]);
    expect(sums.work).toBe(0);
  });

  it('空数据：四个板块都是 0（而不是 undefined）', () => {
    expect(sumMinutesBySection([])).toEqual({ work: 0, study: 0, fitness: 0, life: 0 });
  });
});

describe('sumMonthMinutesBySection — 只算目标月', () => {
  const slots = [
    makeSlot({ id: 'a', date: '2026-09-29', sectionId: 'work', startMin: 9 * 60, endMin: 12 * 60 }),
    makeSlot({ id: 'b', date: '2026-10-01', sectionId: 'work', startMin: 9 * 60, endMin: 10 * 60 }),
    makeSlot({ id: 'c', date: '2026-10-31', sectionId: 'life', startMin: 20 * 60, endMin: 21 * 60 }),
    makeSlot({ id: 'd', date: '2026-11-02', sectionId: 'work', startMin: 9 * 60, endMin: 12 * 60 }),
  ];

  it('月历网格会拉到邻月补位日，这些不能算进本月', () => {
    const sums = sumMonthMinutesBySection(slots, '2026-10');
    expect(sums.work).toBe(60);
    expect(sums.life).toBe(60);
  });

  it('合计同样只算目标月', () => {
    expect(totalMonthMinutes(slots, '2026-10')).toBe(120);
  });

  it('不传对月份：整月没有数据时四个板块都是 0', () => {
    expect(sumMonthMinutesBySection(slots, '2026-12')).toEqual({
      work: 0,
      study: 0,
      fitness: 0,
      life: 0,
    });
    expect(totalMonthMinutes(slots, '2026-12')).toBe(0);
  });
});

describe('formatDuration — 展示文本', () => {
  it('不足一小时只显示分钟', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('整小时不带空尾巴（2h 而不是 2h0m）', () => {
    expect(formatDuration(120)).toBe('2h');
  });

  it('小时 + 分钟', () => {
    expect(formatDuration(125)).toBe('2h5m');
    expect(formatDuration(750)).toBe('12h30m');
  });

  it('负数夹到 0（不显示 -5m）', () => {
    expect(formatDuration(-5)).toBe('0m');
  });
});
