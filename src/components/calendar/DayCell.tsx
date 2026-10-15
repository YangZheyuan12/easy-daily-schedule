import clsx from 'clsx';
import { sectionColor } from '@/domain/constants';
import { useSectionConfigs } from '@/hooks/useSectionConfigs';
import type { DaySummary } from '@/domain/types';
import { shouldShowDayDots } from '@/services/calendarService';
import { useRecentlyChanged } from '@/hooks/useRecentlyChanged';
import type { MonthCell } from '@/utils/date';

/** 无记录时的空点：用最弱的线色，避免整月铺满一排排灰点把日历读成「表格」 */
const EMPTY_DOT = 'rgb(var(--c-surface-line))';

interface DayCellProps {
  /** 该格对应的月历格子 */
  cell: MonthCell;
  /** 当天摘要，决定四个板块色点是否点亮 */
  summary: DaySummary;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (dateKey: string) => void;
}

/**
 * 月历单格（对齐概念稿 C5）：15px 数字坐在 32px 圆里 ——
 * 选中 = 实心重音圆白字；今天 = 重音描边圆。下方是四个板块色点。
 *
 * 四个点的含义是「当天该板块**有没有**顶层条目记录」，不是完成率 ——
 * 6px 的点放不下百分比，日历的职责是让用户一眼扫出「哪天记了、哪天空着」，
 * 具体完成多少交给下方摘要卡。
 *
 * 选中圆会轻轻弹一下（`m-pop-soft`）：日历上点哪一格只有 30px 的实心圆在回应，
 * 没有这点反馈时，手指和结果之间的因果感很弱。
 */
export function DayCell({ cell, summary, isToday, isSelected, onSelect }: DayCellProps) {
  const popped = useRecentlyChanged(isSelected);
  // 四个色点用用户自定义后的板块色（改了色，月历上的点跟着变）
  const sectionConfigs = useSectionConfigs();

  return (
    <button
      type="button"
      onClick={() => onSelect(cell.dateKey)}
      aria-pressed={isSelected}
      aria-label={cell.dateKey}
      className="flex flex-col items-center justify-center min-w-tap h-[46px] transition-colors active:scale-95"
    >
      <span
        className={clsx(
          'w-[32px] h-[32px] rounded-pill flex items-center justify-center text-body leading-none tabular-nums transition-colors',
          // 选中是实心圆，优先级最高；今天是描边圆锚点
          isSelected
            ? 'bg-accent text-accent-fg font-semibold'
            : isToday
              ? 'border-[1.5px] border-accent text-accent font-semibold'
              : cell.inMonth
                ? 'text-ink-soft'
                : 'text-ink-faint/50',
          popped && 'm-pop-soft',
        )}
      >
        {cell.day}
      </span>

      {/*
        色点渲染规则：inMonth 管「别月的点不要串到本月视图里」，
        isToday 是锚点例外 —— 今天即使用户正在看别的月份，也必须能看到今天有没有记录。
        规则本身放在 `calendarService.shouldShowDayDots` 并由单测锁着：
        两个布尔值看着简单，被人当成笔误改回去的成本很高。
      */}
      {shouldShowDayDots(cell, isToday) && (
        <span className="mt-[3px] flex items-center gap-[2px]">
          {sectionConfigs.map((config) => (
            <span
              key={config.key}
              className="w-[5px] h-[5px] rounded-full"
              style={{
                backgroundColor:
                  summary.sections[config.key].total > 0 ? sectionColor(config) : EMPTY_DOT,
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
