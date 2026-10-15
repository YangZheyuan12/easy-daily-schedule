import clsx from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { SECTION_CONFIG_MAP, sectionColor, sectionTint } from '@/domain/constants';
import type { SectionKey } from '@/domain/enums';
import type { WeekSectionBoard } from '@/services/weekViewService';

interface WeekSectionBoardsProps {
  boards: readonly WeekSectionBoard[];
  /** 点某一天 → 切到那一天看当日详情 */
  onSelectDay: (dateKey: string) => void;
  /** 点整个板块 → 进入该板块的本周时间线 */
  onOpenSection: (key: SectionKey) => void;
}

/**
 * 本周四板块田字格（今日页「本周」视图）。
 *
 * 布局：**2×2 铺满「今日页剩余高度」**，所以每个板块**固定占页面的 1/4**（不是随内容伸缩的卡片）。
 * 一格就是「一个板块一整周」的只读汇总：色点组头 + 完成数，格内按天列出本周该板块的事项；
 * 列太长时**格内独立滚动**（`flex-1 min-h-0 overflow-y-auto`），不会把四格推成一屏装不下。
 *
 * 交互分两层，避免互相打架：
 * - 整格可点（`role=button`）→ 进该板块的**本周时间线**详情页；
 * - 格内某一天按钮 `stopPropagation` → 切到那一天看当日详情（不进详情页）。
 *
 * 与课程表的分工是刻意分开的：**课程表看「时间怎么被占用」，田字格看「这周做了什么」**。
 * 同一个周数据给两种视图，是因为这两个问题无法用一张图回答 ——
 * 课程表里有空隙不代表那天闲着（可能有没排时间的条目），
 * 田字格里条目多也不代表花的时间多（时长要去日历页看）。
 *
 * 两个尺寸上的妥协：
 * - 完成态用 6px 圆点而不是勾选框。田字格是**只读汇总**，放一排触摸热区既占地方又暗示「可改」。
 * - 格内字号收到 `caption`（13px 地板），塞得下「周三 + 两条事项」这类的迷你清单即可，详情进详情页看。
 */
export function WeekSectionBoards({ boards, onSelectDay, onOpenSection }: WeekSectionBoardsProps) {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-2.5 h-full">
      {boards.map((board) => {
        const config = SECTION_CONFIG_MAP[board.key];
        return (
          <section
            key={board.key}
            role="button"
            tabIndex={0}
            aria-label={`查看${board.name}本周详情`}
            onClick={() => onOpenSection(board.key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenSection(board.key);
              }
            }}
            className="rounded-card bg-surface border border-surface-line p-2.5 flex flex-col min-h-0 cursor-pointer active:bg-surface-sunken"
          >
            <header className="flex items-center gap-1.5 min-w-0 shrink-0">
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
              <Icon name="chevron-right" size={14} className="text-ink-faint shrink-0" />
            </header>

            {board.days.length === 0 ? (
              <p className="mt-2 text-caption text-ink-faint">本周还没有记录</p>
            ) : (
              <div className="mt-1.5 flex-1 min-h-0 overflow-y-auto -mx-0.5">
                {board.days.map((day) => (
                  <div key={day.dateKey} className="mb-1.5 last:mb-0">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectDay(day.dateKey);
                      }}
                      className="press text-micro text-ink-faint px-0.5 py-0.5 rounded-[3px] inline-flex items-center gap-1"
                      style={{ backgroundColor: sectionTint(config) }}
                    >
                      {day.weekday}
                      <span className="tabular-nums">
                        {day.dateLabel.replace('月', '/').replace('日', '')}
                      </span>
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
