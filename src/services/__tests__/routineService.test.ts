import { describe, expect, it } from 'vitest';
import type { Routine, RoutineCompletion } from '@/domain/types';
import { routineCompletionKey, computeRoutineProgress } from '@/services/routineService';

describe('routineService', () => {
  it('routineCompletionKey 拼出 routineId@date', () => {
    expect(routineCompletionKey('rt_abc', '2026-10-10')).toBe('rt_abc@2026-10-10');
  });

  it('computeRoutineProgress 统计当天 done 的数量并算比率', () => {
    const routines: Routine[] = [
      { id: 'a' } as Routine,
      { id: 'b' } as Routine,
      { id: 'c' } as Routine,
    ];
    const completions: Record<string, RoutineCompletion> = {
      'a@2026-10-10': { id: 'a@2026-10-10', routineId: 'a', date: '2026-10-10', done: true, updatedAt: 1 },
      'b@2026-10-10': { id: 'b@2026-10-10', routineId: 'b', date: '2026-10-10', done: false, updatedAt: 1 },
      // c 不在当天完成记录里 → 视为未完成
      'a@2026-10-11': { id: 'a@2026-10-11', routineId: 'a', date: '2026-10-11', done: true, updatedAt: 1 },
    };

    const progress = computeRoutineProgress(routines, completions, '2026-10-10');
    expect(progress).toEqual({ done: 1, total: 3, ratio: 1 / 3 });
  });

  it('computeRoutineProgress 空模板返回 0 比率（不出现 NaN）', () => {
    const progress = computeRoutineProgress([], {}, '2026-10-10');
    expect(progress).toEqual({ done: 0, total: 0, ratio: 0 });
  });
});
