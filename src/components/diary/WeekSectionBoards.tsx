import clsx from 'clsx';
import { SECTION_CONFIG_MAP, sectionColor, sectionTint } from '@/domain/constants';
import type { WeekSectionBoard } from '@/services/weekViewService';

interface WeekSectionBoardsProps {
  boards: readonly WeekSectionBoard[];
  /** 点某一天 → 切到那一天看当日详情 */
  onSelectDay: (dateKey: string) => void;
}

/**
 * 本周四板块田字格（今日页「本周」视图）。
 *
 * 四格 2×2 铺满宽度，每格是**一个板块一整周**的汇总：色点组头 + 完成数，
 * 格内按天分组列出这一周该板块做过的事（顶层条目 + 归到该板块的时间段）。
 *
 * 与课程表的分工是刻意分开的：**课程表看「时间怎么被占用」，田字格看「这周做了什么」**。
 * 同一个周数据给两种视图，是因为这两个问题无法用一张图回答 ——
 * 课程表里有空隙不代表那天闲着（可能有没排时间的条目），
 * 田字格里条目多也不代表花的时间多（时长要去日历页看）。
 *
 * 两个尺寸上的妥协：
 * - 格内**可滚动**（限高 + overflow-y-auto）。一周七天的清单可能很长，
 *   撑开格子会把四格推成一屏装不下，那就失去了「一屏总览」的意义。
 * - 完成态用 6px 圆点而不是 `Tick` 勾选框。田字格是**只读汇总**，
 *   放一排 38px 的触摸热区既占地方又暗示「这里可以点着改」，而它并不能改。
 */
export function WeekSectionBoards({ boards, onSelectDay }: WeekSectionBoardsProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {boards.map((board) => {
        const config = SECTION_CONFIG_MAP[board.key];
        return (
          <section
            key={board.key}
            className="rounded-card bg-surface border border-surface-line p-2.5 flex flex-col"
          >
            <header className="flex items-center gap-1.5 min-w-0">
              <span
                className="w-2 h-2 rounded-pill shrink-0"
                style={{ backgroundColor: sectionColor(config) }}
              />
              <span className="text-body font-medium text-ink truncate">{board.name}</span>
              <span
                className="ml-auto text-caption tabular-nums shrink-0"
                style={{ color: sectionColor(config) }}
              >
                {board.done}/{board.total}
              </span>
            </header>

            {board.days.length === 0 ? (
              <p className="mt-2 text-caption text-ink-faint">本周还没有记录</p>
            ) : (
              <div className="mt-1.5 max-h-[240px] overflow-y-auto -mx-0.5">
                {board.days.map((day) => (
                  <div key={day.dateKey} className="mb-1.5 last:mb-0">
                    <button
                      type="button"
                      onClick={() => onSelectDay(day.dateKey)}
                      className="press text-micro text-ink-faint px-0.5 py-0.5 rounded-[3px] inline-flex items-center gap-1"
                      style={{ backgroundColor: sectionTint(config) }}
                    >
                      {day.weekday}
                      <span className="tabular-nums">{day.dateLabel.replace('月', '/').replace('日', '')}</span>
                    </button>
                    <ul>
                      {day.entries.map((entry) => (
                        <li key={entry.id} className="flex items-start gap-1.5 py-[1px]">
                          <span
                            aria-hidden
                            className={clsx(
                              'mt-[6px] w-1.5 h-1.5 rounded-pill shrink-0',
                              entry.done ? '' : 'border border-edge-strong',
                            )}
                            style={
                              entry.done
                                ? { backgroundColor: sectionColor(config) }
                                : undefined
                            }
                          />
                          <span
                            className={clsx(
                              'text-caption leading-[18px] break-all min-w-0',
                              entry.done ? 'text-ink-faint line-through' : 'text-ink',
                            )}
                          >
                            {entry.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
