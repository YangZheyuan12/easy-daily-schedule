import { describe, expect, it } from 'vitest';
import { listDueSlots } from '../reminderService';
import { makeSlot } from './fixtures';

describe('listDueSlots — 到期判定', () => {
  it('now < startMin 不到期', () => {
    const slots = [makeSlot({ id: 's', startMin: 600 })];
    expect(listDueSlots(slots, 599)).toHaveLength(0);
  });

  it('now == startMin 到期（含等于边界）', () => {
    const slots = [makeSlot({ id: 's', startMin: 600 })];
    expect(listDueSlots(slots, 600).map((s) => s.id)).toEqual(['s']);
  });

  it('now > startMin 也到期', () => {
    const slots = [makeSlot({ id: 's', startMin: 600 })];
    expect(listDueSlots(slots, 700).map((s) => s.id)).toEqual(['s']);
  });

  it('已完成的不提醒', () => {
    const slots = [makeSlot({ id: 's', startMin: 600, done: true })];
    expect(listDueSlots(slots, 700)).toHaveLength(0);
  });

  it('软删的不提醒', () => {
    const slots = [makeSlot({ id: 's', startMin: 600, deletedAt: 999 })];
    expect(listDueSlots(slots, 700)).toHaveLength(0);
  });

  it('startMin 为 0 视为「未设定具体时间」，不触发', () => {
    const slots = [makeSlot({ id: 's', startMin: 0 })];
    expect(listDueSlots(slots, 1439)).toHaveLength(0);
  });

  it('混合场景只返回真正到期的', () => {
    const slots = [
      makeSlot({ id: 'due', startMin: 500 }),
      makeSlot({ id: 'future', startMin: 700 }),
      makeSlot({ id: 'done', startMin: 500, done: true }),
      makeSlot({ id: 'deleted', startMin: 500, deletedAt: 1 }),
      makeSlot({ id: 'unset', startMin: 0 }),
    ];
    expect(listDueSlots(slots, 600).map((s) => s.id)).toEqual(['due']);
  });
});

describe('listDueSlots — 负向验证', () => {
  it('endMin 不参与判定：时段过了没记录的仍要提醒（不以 endMin 截断到期窗口）', () => {
    // 若有人「修正」为 nowMin <= endMin 才算到期，这个用例会漏掉 12:00 的提醒
    const slots = [makeSlot({ id: 's', startMin: 600, endMin: 660 })];
    expect(listDueSlots(slots, 1200).map((s) => s.id)).toEqual(['s']);
  });

  it('到期窗口不含 startMin 的话，准点时段会被漏掉', () => {
    // 若判定改成 nowMin > startMin（去掉等于），准点 600 就漏了
    const slots = [makeSlot({ id: 's', startMin: 600 })];
    expect(listDueSlots(slots, 600)).toHaveLength(1);
  });
});
