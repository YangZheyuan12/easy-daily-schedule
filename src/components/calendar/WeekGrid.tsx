import { Icon } from '@/components/ui/Icon';
import { useState } from 'react';
import clsx from 'clsx';
import type { DaySummary } from '@/domain/types';
import { emptySummary } from '@/services/calendarService';
import { weekRangeLabel } from '@/utils/date';
import { DayCell } from './DayCell';

/** 周一为第一列 */
const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'] as const;

interface WeekGridProps {
  /** 该周周一的日期键 */
  weekStartKey: string;
  /** 这一周的 7 个日期键（顺序：周一 → 周日） */
  weekDays: readonly string[];
  summaries: Record<string, DaySummary>;
  selectedDate: string;
  todayKey: string;
  onSelect: (dateKey: string) => void;
  onShiftWeek: (delta: number) => void;
}

/**
 * 周视图网格（**纯展示组件**）。
 *
 * 等价于「把月历截断成一行」：星期表头 + 单行 7 天，布局与 `MonthGrid` 同族，
 * 每一格复用 `DayCell`（数字圆 + 四个板块色点）。区别只是只有一行、不跨月补位。
 *
 * 整周都是「展示焦点」：7 格的 `inMonth` 一律置真，于是四板块色点全部点亮
 * （不像月视图要把邻月补位格的点藏起来）—— 周视图本身就是「看这一周」，
 * 跨月的两天也该照常显示有没有记录。
 */
export function WeekGrid({
  weekStartKey,
  weekDays,
  summaries,
  selectedDate,
  todayKey,
  onSelect,
  onShiftWeek,
}: WeekGridProps) {
  /*
    换周方向：与月视图同一手法，只锁一次方向、之后保持不动，避免取数完成后的
    二次渲染把 animation-name 改掉、动画从头重播。
  */
  const [prevStart, setPrevStart] = useState(weekStartKey);
  const [direction, setDirection] = useState(0);
  if (prevStart !== weekStartKey) {
    setPrevStart(weekStartKey);
    setDirection(weekStartKey > prevStart ? 1 : -1);
  }
  const enterClass =
    direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left';

  return (
    <section className="px-3 pt-3">
      <div className="bg-surface rounded-card border border-surface-line shadow-card p-2">
        {/* 周区间切换栏（居中大标题 + 两侧箭头，弱化箭头，突出「几月几日 – 几月几日」） */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => onShiftWeek(-1)}
            aria-label="上一周"
            className="press min-w-tap min-h-tap flex items-center justify-center text-ink-faint"
          >
            <Icon name="chevron-left" size={20} />
          </button>
          <div
            key={weekStartKey}
            className={clsx('text-heading font-semibold text-ink tabular-nums', enterClass)}
          >
            {weekRangeLabel(weekStartKey)}
          </div>
          <button
            type="button"
            onClick={() => onShiftWeek(1)}
            aria-label="下一周"
            className="press min-w-tap min-h-tap flex items-center justify-center text-ink-faint"
          >
            <Icon name="chevron-right" size={20} />
          </button>
        </div>

        {/* 星期栏 */}
        <div className="mt-0.5 grid grid-cols-7">
          {WEEK_HEADS.map((head) => (
            <div
              key={head}
              className="h-[24px] flex items-center justify-center text-caption text-ink-faint"
            >
              {head}
            </div>
          ))}
        </div>

        {/* 单行 7 天（换周时整片从对应方向滑入） */}
        <div key={weekStartKey} className={clsx('grid grid-cols-7', enterClass)}>
          {weekDays.map((dateKey) => (
            <DayCell
              key={dateKey}
              cell={{ dateKey, day: Number(dateKey.slice(8, 10)), inMonth: true }}
              summary={summaries[dateKey] ?? emptySummary(dateKey)}
              isToday={dateKey === todayKey}
              isSelected={dateKey === selectedDate}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
