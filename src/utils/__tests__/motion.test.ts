import { describe, expect, it } from 'vitest';
import { staggerDelay } from '@/utils/motion';

/**
 * 列表落定节拍。
 *
 * 锁住「封顶」这条：不封顶的话 20 条的板块最后一行要等近半秒才出现，
 * 那不是「有质感」而是「卡」。这类参数最容易被后来人当成笔误删掉。
 */
describe('staggerDelay', () => {
  it('逐行递增', () => {
    expect(staggerDelay(0)).toBe('0ms');
    expect(staggerDelay(1)).toBe('24ms');
    expect(staggerDelay(3)).toBe('72ms');
  });

  it('第 6 行之后不再继续增加（封顶）', () => {
    expect(staggerDelay(6)).toBe('144ms');
    expect(staggerDelay(7)).toBe('144ms');
    expect(staggerDelay(50)).toBe('144ms');
  });

  it('负数按下标 0 处理（防止算出非法 CSS 值）', () => {
    expect(staggerDelay(-3)).toBe('0ms');
  });
});
