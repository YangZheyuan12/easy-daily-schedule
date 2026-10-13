import { describe, expect, it } from 'vitest';
import type { Rating } from '@/domain/enums';
import { nextRating } from '@/components/selfstatus/SelfStatusCard';

/**
 * 自我状态的交互规则（QA）。
 *
 * 这里锁的是「再点一次当前分值要清零」这条交互：
 * 打完分就再也取消不掉，用户只能刷新页面 —— 属于看得见但测不到的那类缺陷。
 */
describe('nextRating — 心情 / 身体的评分切换', () => {
  it('未打分时点第 N 颗就是 N 分', () => {
    expect(nextRating(0, 1)).toBe(1);
    expect(nextRating(0, 3)).toBe(3);
    expect(nextRating(0, 5)).toBe(5);
  });

  it('点另一个分值就是改分，不是清零', () => {
    expect(nextRating(2, 4)).toBe(4);
    expect(nextRating(5, 1)).toBe(1);
  });

  it('再点当前分值 → 清零（否则打完分无法撤销）', () => {
    for (let value = 1; value <= 5; value += 1) {
      expect(nextRating(value as Rating, value)).toBe(0);
    }
  });

  it('清零后再点同一颗，能重新打回原值（可反复切换）', () => {
    let current: Rating = 0;
    current = nextRating(current, 4);
    expect(current).toBe(4);
    current = nextRating(current, 4);
    expect(current).toBe(0);
    current = nextRating(current, 4);
    expect(current).toBe(4);
  });

  it('结果永远是 0–5 的合法 Rating', () => {
    for (let current = 0; current <= 5; current += 1) {
      for (let clicked = 1; clicked <= 5; clicked += 1) {
        const next = nextRating(current as Rating, clicked);
        expect(Number.isInteger(next)).toBe(true);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(5);
      }
    }
  });
});
