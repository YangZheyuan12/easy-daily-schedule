import clsx from 'clsx';
import type { TimeSlot } from '@/domain/types';
import { SECTION_CONFIG_MAP, sectionColor, sectionTint } from '@/domain/constants';
import { hourTicks, type WeekCell, type WeekWindow } from '@/services/weekViewService';
import { minToHHMM } from '@/utils/date';

/** 每一小时对应的像素高度 */
const HOUR_HEIGHT = 46;
/** 列头里的「一二三…日」 */
const WEEKDAY_HEADS = ['一', '二', '三', '四', '五', '六', '日'] as const;

interface WeekTimetableProps {
  /** 本周七天的日期键（周一 → 周日） */
  weekDays: readonly string[];
  cells: readonly WeekCell[];
  timeWindow: WeekWindow;
  todayKey: string;
  /** 点一个已有的时间块 */
  onSelectSlot: (slot: TimeSlot) => void;
  /** 点空格（某天某个整点） */
  onSelectEmpty: (dateKey: string, startMin: number) => void;
}

/**
 * 周视图课程表（时间轴页）。
 *
 * 纵向是时间、横向是周一到周日，时间块按**真实起止时间**定位（不是一格填一个色），
 * 所以「9:10–9:50」和「9:00–10:00」在表上的高度就是不一样的 ——
 * 这是它区别于「清单」的地方：看的是**时间被占用的形状**，而不只是有哪些事。
 *
 * 两个刻意的设计：
 * - **列宽平均分配、不横向滚动**。一周要能一眼看完，横向滚动会让「周三下午很满」
 *   这种整体判断失效（得来回拖才能比对）。代价是列窄（约 50px），
 *   所以块内只放时间与标题，标题超长截断 —— 详情点开看。
 * - **空格可点**。每列每个整点都是可点的，点空白直接新增那一天的该时刻，
 *   省掉「先切到那天、再点添加、再调时间」三步。
 */
export function WeekTimetable({
  weekDays,
  cells,
  timeWindow,
  todayKey,
  onSelectSlot,
  onSelectEmpty,
}: WeekTimetableProps) {
  const ticks = hourTicks(timeWindow);
  const span = timeWindow.endMin - timeWindow.startMin;
  const hours = span / 60;
  const height = hours * HOUR_HEIGHT;
  /** 某分钟在网格里的纵向百分比 */
  const percentOf = (min: number) => ((min - timeWindow.startMin) / span) * 100;

  return (
    <div className="rounded-card bg-surface border border-surface-line overflow-hidden">
      {/* 表头：周几 + 几号 */}
      <div className="flex border-b border-surface-line">
        <div className="w-11 shrink-0" />
        {weekDays.map((dateKey, index) => {
          const day = Number(dateKey.slice(8, 10));
          const isToday = dateKey === todayKey;
          return (
            <div
              key={dateKey}
              className={clsx(
                'flex-1 min-w-0 py-1.5 flex flex-col items-center',
                isToday && 'bg-accent-soft',
              )}
            >
              <span
                className={clsx(
                  'text-caption leading-4',
                  isToday ? 'text-accent font-medium' : 'text-ink-muted',
                )}
              >
                {WEEKDAY_HEADS[index]}
              </span>
              <span
                className={clsx(
                  'text-meta tabular-nums leading-5',
                  isToday ? 'text-accent font-semibold' : 'text-ink',
                )}
              >
                {day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex">
        {/* 左：时间刻度列 */}
        <div className="relative w-11 shrink-0" style={{ height }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-1.5 -translate-y-1/2 text-caption text-ink-faint tabular-nums"
              style={{ top: `${percentOf(tick)}%` }}
            >
              {minToHHMM(tick).slice(0, 2)}
            </span>
          ))}
        </div>

        {/* 右：七列网格 */}
        <div className="relative flex-1" style={{ height }}>
          {/* 整点横线 */}
          {ticks.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute inset-x-0 h-px bg-surface-line"
              style={{ top: `${percentOf(tick)}%` }}
            />
          ))}
          {/* 列分隔线 */}
          {weekDays.slice(1).map((dateKey) => (
            <span
              key={dateKey}
              aria-hidden
              className="absolute top-0 bottom-0 w-px bg-surface-line"
              style={{ left: `${((weekDays.indexOf(dateKey) + 1) / 7) * 100}%` }}
            />
          ))}

          {/* 空格点击区：每列每整点一格 */}
          {weekDays.map((dateKey) =>
            ticks.slice(0, -1).map((tick) => (
              <button
                key={`${dateKey}-${tick}`}
                type="button"
                onClick={() => onSelectEmpty(dateKey, tick)}
                aria-label={`${dateKey} ${minToHHMM(tick)} 添加时间段`}
                className="absolute press"
                style={{
                  left: `${(weekDays.indexOf(dateKey) / 7) * 100}%`,
                  width: `${100 / 7}%`,
                  top: `${percentOf(tick)}%`,
                  height: HOUR_HEIGHT,
                }}
              />
            )),
          )}

          {/* 时间块 */}
          {cells.map((cell) => {
            const config = cell.slot.sectionId ? SECTION_CONFIG_MAP[cell.slot.sectionId] : null;
            return (
              <button
                key={cell.slot.id}
                type="button"
                onClick={() => onSelectSlot(cell.slot)}
                className={clsx(
                  'absolute press overflow-hidden rounded-[3px] px-1 py-0.5 text-left',
                  cell.slot.done && 'opacity-60',
                )}
                style={{
                  left: `${((cell.dayIndex + cell.lane / cell.laneCount) / 7) * 100}%`,
                  width: `${(1 / cell.laneCount / 7) * 100}%`,
                  top: `${cell.top * 100}%`,
                  height: `${cell.height * 100}%`,
                  minHeight: 18,
                  backgroundColor: config ? sectionTint(config) : 'rgb(var(--c-surface-sunken))',
                  borderLeft: `2.5px solid ${config ? sectionColor(config) : 'rgb(var(--c-edge-strong))'}`,
                }}
              >
                <span
                  className="block text-micro leading-[13px] tabular-nums truncate"
                  style={{ color: config ? sectionColor(config) : 'rgb(var(--c-ink-faint))' }}
                >
                  {minToHHMM(cell.slot.actualStartMin ?? cell.slot.startMin)}
                </span>
                <span
                  className={clsx(
                    'block text-caption leading-4 break-all',
                    cell.slot.done ? 'text-ink-faint line-through' : 'text-ink',
                  )}
                  style={{ maxHeight: 32, overflow: 'hidden' }}
                >
                  {cell.slot.content || '未命名'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
