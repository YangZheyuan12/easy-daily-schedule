import { Icon } from '@/components/ui/Icon';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { DaySummary } from '@/domain/types';
import { EMPTY_SUMMARY } from '@/services/calendarService';
import { monthGrid, monthLabel } from '@/utils/date';
import { DayCell } from './DayCell';

/** 周一为第一列 */
const WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'] as const;

interface MonthGridProps {
  monthKey: string;
  /** 月历每一格的摘要，key 为日期键 */
  summaries: Record<string, DaySummary>;
  selectedDate: string;
  todayKey: string;
  onSelect: (dateKey: string) => void;
  onShiftMonth: (delta: number) => void;
}

/**
 * 月历网格（**纯展示组件**）。
 *
 * 所有数据都从 props 进来、所有交互都通过回调出去：将来首页要做「点日期栏
 * 弹出日历」时，直接换一个容器复用即可，不用把取数逻辑复制一遍。
 */
export function MonthGrid({
  monthKey,
  summaries,
  selectedDate,
  todayKey,
  onSelect,
  onShiftMonth,
}: MonthGridProps) {
  const cells = useMemo(() => monthGrid(monthKey), [monthKey]);

  /*
    换月方向：`YYYY-MM` 同样是字典序可比，于是「下一月」从右侧进、「上一月」从左侧进。

    关键：方向必须**锁住**，不能在每次渲染时重算。
    重算的写法（`monthKey > ref.current ? ...`）在第一次渲染时是对的，
    但取数完成后 store 还会再 set 一次（loading → false），那次渲染里
    monthKey 已经等于 ref 了 → 方向被算成 0 → class 从 m-slide-right 变回 m-fade，
    而**改 animation-name 会让动画从头重播**：用户看到的是滑一半突然变成淡入。

    所以用 React 官方的「渲染期根据 props 变化调整 state」写法：
    只在 monthKey 真的换了那一次改 direction，之后保持不动。
    这个写法在 StrictMode 的双次渲染下也是幂等的。
  */
  const [prevMonth, setPrevMonth] = useState(monthKey);
  const [direction, setDirection] = useState(0);
  if (prevMonth !== monthKey) {
    setPrevMonth(monthKey);
    setDirection(monthKey > prevMonth ? 1 : -1);
  }

  const enterClass =
    direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left';

  return (
    <section className="px-3 pt-3">
      <div className="bg-surface rounded-card border border-surface-line shadow-card p-2">
        {/* 月份切换栏（概念稿 C5：月份字号与板块组头同级，箭头弱化） */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => onShiftMonth(-1)}
            aria-label="上一个月"
            className="press min-w-tap min-h-tap flex items-center justify-center text-ink-faint"
          >
            <Icon name="chevron-left" size={20} />
          </button>
          <div
            key={monthKey}
            className={clsx('text-heading font-semibold text-ink tabular-nums', enterClass)}
          >
            {monthLabel(monthKey)}
          </div>
          <button
            type="button"
            onClick={() => onShiftMonth(1)}
            aria-label="下一个月"
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

        {/* 6 周 × 7 天，固定 42 格（换月时整片从对应方向滑入，方向就是用户手指的动作方向） */}
        <div key={monthKey} className={clsx('grid grid-cols-7', enterClass)}>
          {cells.map((cell) => (
            <DayCell
              key={cell.dateKey}
              cell={cell}
              summary={summaries[cell.dateKey] ?? EMPTY_SUMMARY}
              isToday={cell.dateKey === todayKey}
              isSelected={cell.dateKey === selectedDate}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
