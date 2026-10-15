import { Icon } from '@/components/ui/Icon';
import { SECTION_CONFIGS, sectionColor, sectionTint } from '@/domain/constants';
import { buildWeekSectionBoards } from '@/services/weekViewService';
import { toPercent } from '@/services/progressService';
import type { Item, TimeSlot } from '@/domain/types';

interface WeekTaskOverviewProps {
  /** 整周条目（顶层 + 全部），由 store 透传 */
  items: readonly Item[];
  /** 整周时间段 */
  slots: readonly TimeSlot[];
  /** 这一周的 7 个日期键（周一 → 周日） */
  weekDays: readonly string[];
  /** 跳到目标页的本周视图：今日 / 时间轴 */
  onOpen: (target: 'today' | 'timeline') => void;
}

/**
 * 本周任务总览（日历周视图第二张卡片）。
 *
 * 顶部是本周四板块完成度总览（与「今日」页田字格同一口径，复用 `buildWeekSectionBoards`
 * 的聚合，不另写一份），下方两个入口按钮分别跳到：
 * - **今日 · 本周视图**：四板块田字格；
 * - **时间轴 · 本周视图**：课程表。
 *
 * 两块跳转都由调用方（CalendarPage）负责先对齐全局日期再导航，本卡片只发意图。
 */
export function WeekTaskOverview({ items, slots, weekDays, onOpen }: WeekTaskOverviewProps) {
  const boards = buildWeekSectionBoards(items, slots, weekDays);
  const totalCount = boards.reduce((sum, board) => sum + board.total, 0);
  const doneCount = boards.reduce((sum, board) => sum + board.done, 0);
  const overall = totalCount === 0 ? 0 : doneCount / totalCount;

  return (
    <section className="mx-5 mt-3 rounded-card bg-surface border border-surface-line p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-body font-medium text-ink">本周任务总览</span>
        <span className="text-caption text-ink-faint tabular-nums">
          {totalCount === 0 ? '暂无记录' : `完成 ${toPercent(overall)}%`}
        </span>
      </div>

      <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
        {boards.map((board) => {
          const config = SECTION_CONFIGS.find((c) => c.key === board.key) ?? SECTION_CONFIGS[0];
          return (
            <li
              key={board.key}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5"
              style={{ backgroundColor: sectionTint(config) }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: sectionColor(config) }}
              />
              <span className="text-caption text-ink-soft shrink-0">{config.name}</span>
              <span className="ml-auto text-caption text-ink-muted tabular-nums">
                {board.total === 0 ? '—' : `${board.done}/${board.total}`}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onOpen('today')}
          className="min-h-[46px] rounded-sm bg-surface-sunken text-body text-ink-muted active:bg-surface-line/50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="home" size={16} />
          今日·本周视图
        </button>
        <button
          type="button"
          onClick={() => onOpen('timeline')}
          className="min-h-[46px] rounded-sm bg-surface-sunken text-body text-ink-muted active:bg-surface-line/50 transition-colors flex items-center justify-center gap-1.5"
        >
          <Icon name="clock" size={16} />
          时间轴·本周视图
        </button>
      </div>
    </section>
  );
}
