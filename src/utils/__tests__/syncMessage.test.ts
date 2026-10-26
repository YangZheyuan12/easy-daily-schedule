import { describe, expect, it } from 'vitest';
import { describeSyncCounts, syncButtonLabel } from '../syncMessage';

describe('describeSyncCounts — 同步结果的提示语', () => {
  it('只新建', () => {
    expect(describeSyncCounts(3, 0)).toBe('已同步 3 项到今日');
  });

  it('只更新（用户最容易误以为「什么都没发生」的那种）', () => {
    expect(describeSyncCounts(0, 2)).toBe('已更新今日的 2 项');
  });

  it('既有新建又有更新', () => {
    expect(describeSyncCounts(1, 2)).toBe('新建 1 项、更新 2 项');
  });

  it('都没动', () => {
    expect(describeSyncCounts(0, 0)).toBe('没有变化，今日页已经是最新');
  });
});

describe('syncButtonLabel — 确认按钮文案', () => {
  it('不在勾选模式时给兜底标签', () => {
    expect(syncButtonLabel(null)).toBe('同步到今日');
  });

  it('新建与更新分开说', () => {
    expect(syncButtonLabel({ create: 2, update: 1 })).toBe('新建 2 项、更新 1 项');
    expect(syncButtonLabel({ create: 2, update: 0 })).toBe('同步 2 项到今日');
    expect(syncButtonLabel({ create: 0, update: 1 })).toBe('更新 1 项');
  });

  it('负向：什么都动不了时不能写成「同步 0 项」', () => {
    expect(syncButtonLabel({ create: 0, update: 0 })).toBe('今日页已是最新');
  });

  it('未勾选任何任务时提示「请勾选」，不能写「今日页已是最新」', () => {
    expect(syncButtonLabel({ create: 0, update: 0 }, false)).toBe('请勾选要同步的任务');
    // 即使有可同步的项，只要还没勾选，也不该用「已是最新」的口吻
    expect(syncButtonLabel({ create: 3, update: 0 }, false)).toBe('请勾选要同步的任务');
  });
});
