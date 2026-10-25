import { useMemo } from 'react';
import clsx from 'clsx';
import { monthGrid, monthsInYear, monthLabel, todayKey } from '@/utils/date';

/** 年视图里周几的极简表头：只留首尾，中间用点占位，省横向空间 */
const COMPACT_WEEKDAYS = ['一', '··', '··', '··', '··', '··', '日'] as const;

interface YearGridProps {
  yearKey: string;
  /** key 为日期键，true = 该天有记录（迷你格上色用） */
  yearDayDots: Record<string, boolean>;
  /** 点击某个月 → 切换到月视图并选中该月 */
  onSelectMonth: (monthKey: string) => void;
  /** 当前正在查看的月份（高亮用） */
  activeMonthKey?: string;
}

/**
 * 年视图：12 个「缩小版月历」垂直排列（荣耀日历风格）。
 *
 * 每个月份渲染成一张迷你月历：7 列格子里每一格是当月真实的一天，
 * 有记录的那一格点一个重音小圆点。这样一眼就能扫出「哪个月忙、哪天有安排」，
 * 而不是只看「N 天有记录」这种汇总数字。
 *
 * 点整张迷你月历 = 放大进月视图（`onSelectMonth`）。月视图面板带 `m-zoom-in`，
 * 配合这里「以小见大」的视觉，读起来就是从这一格放大到整月。
 *
 * 纯展示：数据从 props 进来、点击通过回调出去。
 */
export function YearGrid({ yearKey, yearDayDots, onSelectMonth, activeMonthKey }: YearGridProps) {
  const months = useMemo(() => monthsInYear(yearKey), [yearKey]);
  const today = todayKey();

  return (
    <section className="px-3 pt-3 space-y-3">
      {months.map((monthKey) => {
        const cells = monthGrid(monthKey);
        const isActive = monthKey === activeMonthKey;
        return (
          <button
            key={monthKey}
            type="button"
            onClick={() => onSelectMonth(monthKey)}
            className={clsx(
              'block w-full text-left rounded-card border p-3 transition-colors active:scale-[0.99]',
              isActive
                ? 'border-accent bg-accent-soft'
                : 'border-surface-line bg-surface shadow-card',
            )}
            aria-label={`查看${monthLabel(monthKey)}`}
          >
            <div className="flex items-baseline justify-between mb-1.5">
              <span
                className={clsx(
                  'text-body font-medium tabular-nums',
                  isActive ? 'text-accent' : 'text-ink-soft',
                )}
              >
                {monthLabel(monthKey).replace(`${yearKey}年`, '')}
              </span>
            </div>

            <div className="grid grid-cols-7 gap-x-0.5 gap-y-1">
              {COMPACT_WEEKDAYS.map((w, i) => (
                <div
                  key={i}
                  className="text-center text-[9px] leading-none text-ink-faint h-2.5 flex items-center justify-center"
                >
                  {w}
                </div>
              ))}
              {cells.map((cell) => {
                const hasData = cell.inMonth && yearDayDots[cell.dateKey] === true;
                const isTodayCell = cell.dateKey === today;
                return (
                  <div
                    key={cell.dateKey}
                    className={clsx(
                      'flex items-center justify-center',
                      cell.inMonth ? 'text-[10px]' : 'text-[10px] opacity-30',
                      isTodayCell && 'font-semibold text-accent',
                    )}
                  >
                    {hasData ? (
                      <span className="flex flex-col items-center leading-none">
                        <span>{cell.day}</span>
                        <span className="mt-0.5 w-1 h-1 rounded-full bg-accent" />
                      </span>
                    ) : (
                      <span>{cell.day}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </section>
  );
}
