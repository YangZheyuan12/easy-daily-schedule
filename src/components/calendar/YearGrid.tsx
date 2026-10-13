import { useMemo } from 'react';
import clsx from 'clsx';
import type { MonthMiniSummary } from '@/services/calendarService';
import { SECTION_CONFIGS, sectionColor } from '@/domain/constants';

/** 与 DayCell 一致：无记录时的空点 */
const EMPTY_DOT = 'rgb(var(--c-edge-strong))';
import { monthsInYear, monthLabel } from '@/utils/date';

interface YearGridProps {
  yearKey: string;
  /** key 为月键的迷你汇总 */
  yearSummaries: Record<string, MonthMiniSummary>;
  /** 点击某个月 → 切换到月视图并选中该月 */
  onSelectMonth: (monthKey: string) => void;
  /** 当前正在查看的月份（高亮用） */
  activeMonthKey?: string;
}

/**
 * 年视图网格（iOS / macOS 风格的 3×4 月份矩阵）。
 *
 * 纯展示：月份迷你汇总从 props 进来、点击通过回调出去。
 * 每个 MiniMonth 显示月份名 + 「N 天有记录」+ 四个板块的小色点（按比例）。
 */
export function YearGrid({ yearKey, yearSummaries, onSelectMonth, activeMonthKey }: YearGridProps) {
  const months = useMemo(() => monthsInYear(yearKey), [yearKey]);

  return (
    <section className="px-3 pt-3">
      <div className="bg-surface rounded-card border border-surface-line shadow-card p-3">
        <div className="grid grid-cols-3 gap-2">
          {months.map((monthKey) => {
            const summary = yearSummaries[monthKey];
            const hasAny = summary?.hasAny ?? false;
            const labelText = monthLabel(monthKey).replace(`${yearKey}年`, ''); // '10月'
            const isActive = monthKey === activeMonthKey;
            return (
              <button
                key={monthKey}
                type="button"
                onClick={() => onSelectMonth(monthKey)}
                className={clsx(
                  'flex flex-col items-center justify-center rounded-card py-3 border transition-colors active:scale-[0.98]',
                  isActive
                    ? 'border-accent bg-accent-soft'
                    : 'border-transparent bg-surface-sunken',
                )}
              >
                <span
                  className={clsx(
                    'text-heading font-medium tabular-nums',
                    isActive ? 'text-accent' : 'text-ink-soft',
                  )}
                >
                  {labelText}
                </span>
                <span className="mt-0.5 text-caption text-ink-faint tabular-nums">
                  {hasAny ? `${summary?.daysWithData ?? 0}天有记录` : '未记录'}
                </span>
                <span className="mt-1.5 flex items-center gap-[3px]">
                  {SECTION_CONFIGS.map((config) => {
                    const sec = summary?.sections[config.key];
                    const active = (sec?.total ?? 0) > 0;
                    return (
                      <span
                        key={config.key}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: active ? sectionColor(config) : EMPTY_DOT }}
                      />
                    );
                  })}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
