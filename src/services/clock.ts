/**
 * 时钟抽象。
 *
 * 之所以不直接到处写 `Date.now()`：单测需要固定时间，
 * 否则「撤销窗口 5 秒」「软删 7 天清理」这类逻辑无法稳定断言。
 */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export function createFixedClock(fixed: number): Clock {
  return { now: () => fixed };
}
