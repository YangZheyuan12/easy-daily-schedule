import { useMemo } from 'react';
import { getFestivalLine } from '@/services/festivalService';
import { formatLunarMonthDay, solarToLunar } from '@/services/lunar/lunarService';

/**
 * 某一天的「农历 + 节日」展示行。
 *
 * 刻意做得很薄：Phase 2 会在这里额外读取「自定义纪念日」store，
 * 届时只改本 hook 的函数体，日期栏 / 摘要卡等调用点一个字都不用动。
 *
 * - `lunarLine`：农历月日文案，如 `'九月初三'`；**越界 / 非法日期返回 `''`**（不崩）。
 * - `festivalLine`：内置节日行，如 `'中秋节'`、`'中秋节 · 国庆节'`；无节日返回 `null`。
 *
 * 只读、纯计算，无副作用，重复渲染结果稳定（`useMemo` 按 date 缓存）。
 */
export function useDayFestivals(date: string): { festivalLine: string | null; lunarLine: string } {
  return useMemo(() => {
    const lunar = solarToLunar(date);
    return {
      lunarLine: lunar ? formatLunarMonthDay(lunar) : '',
      festivalLine: getFestivalLine(date),
    };
  }, [date]);
}
