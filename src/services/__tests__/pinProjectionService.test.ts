import { describe, expect, it } from 'vitest';
import { isActivelyPinned, isPinnedOn, isPinProjection } from '@/services/pinProjectionService';
import { makeTask } from './fixtures';

/**
 * 「定住」投影的纯逻辑契约（QA）。
 *
 * 重点锁定一个容易踩的坑：**「投影是否生效」和「视觉定住态」是两个不同概念**。
 * 取消定住是「延迟」的（pinUntil = 取消日 + 1），所以取消当天任务仍投影；
 * 但 UI 的图钉图标该立即变回「未定住」，否则用户点「取消」看不到任何反馈，
 * 会以为取消没生效（这就是本次要修的 bug）。
 */
describe('isActivelyPinned — 视觉定住态', () => {
  it('未定住（pinFrom=null）：false', () => {
    expect(isActivelyPinned(makeTask({ id: 't1', pinFrom: null, pinUntil: null }))).toBe(false);
  });

  it('活跃定住中（pinFrom 非空、pinUntil=null）：true', () => {
    expect(isActivelyPinned(makeTask({ id: 't2', pinFrom: '2026-10-26', pinUntil: null }))).toBe(
      true,
    );
  });

  it('已取消（pinFrom 非空、pinUntil 已设）：false —— 取消后图钉应立即变回未定住态', () => {
    expect(
      isActivelyPinned(makeTask({ id: 't3', pinFrom: '2026-10-26', pinUntil: '2026-10-27' })),
    ).toBe(false);
  });
});

describe('isPinnedOn — 投影是否生效', () => {
  it('取消当天仍投影（延迟取消，D < pinUntil）', () => {
    const task = makeTask({ id: 't4', pinFrom: '2026-10-26', pinUntil: '2026-10-27' });
    // 取消日是 10-26，pinUntil = 10-27；10-26 当天仍在投影窗口内
    expect(isPinnedOn(task, '2026-10-26')).toBe(true);
  });

  it('取消次日不再投影（D >= pinUntil）', () => {
    const task = makeTask({ id: 't5', pinFrom: '2026-10-26', pinUntil: '2026-10-27' });
    expect(isPinnedOn(task, '2026-10-27')).toBe(false);
    expect(isPinnedOn(task, '2026-10-28')).toBe(false);
  });
});

describe('isPinProjection — 投影判定（用于排除同步）', () => {
  it('定住本体（pinFrom === date）不是投影', () => {
    expect(isPinProjection(makeTask({ id: 't6', pinFrom: '2026-10-26' }), '2026-10-26')).toBe(
      false,
    );
  });

  it('更早定住的任务在当天是投影', () => {
    expect(isPinProjection(makeTask({ id: 't7', pinFrom: '2026-10-25' }), '2026-10-26')).toBe(
      true,
    );
  });
});
