import clsx from 'clsx';
import type { TimeSlot } from '@/domain/types';
import { sectionColor, sectionTint } from '@/domain/constants';
import { useSectionConfigs } from '@/hooks/useSectionConfigs';
import {
  WEEK_WINDOW,
  TICK_STEP_HOURS,
  gridTicks,
  tickLabel,
  type WeekWindow,
  type WeekCell,
} from '@/services/weekViewService';
/** 每一小时对应的像素高度。18 小时 → 720px，一小时 40px 足够放一行字 */
const HOUR_HEIGHT = 40;
/** 列头里的「一二三…日」 */
const WEEKDAY_HEADS = ['一', '二', '三', '四', '五', '六', '日'] as const;
/** 块内文字每行占的像素高度（text-caption + leading-4） */
const LINE_PX = 16;

interface WeekTimetableProps {
  /** 本周七天的日期键（周一 → 周日） */
  weekDays: readonly string[];
  cells: readonly WeekCell[];
  todayKey: string;
  /** 纵向时间窗（可自定义起止，默认 06:00–24:00） */
  timeWindow?: WeekWindow;
  /** 横向分割线间隔（小时，默认 2） */
  tickStepHours?: number;
  /** 点一个已有的时间块 */
  onSelectSlot: (slot: TimeSlot) => void;
  /** 点空格（某天某个整点） */
  onSelectEmpty: (dateKey: string, startMin: number) => void;
}

/**
 * 周视图课程表（时间轴页）。
 *
 * 纵向是时间（**默认 06:00–24:00，可在「我的」里自定义起止与间隔**）、
 * 横向是周一到周日，时间块按**真实起止时间**定位
 * （不是一格填一个色），所以「9:10–9:50」和「9:00–10:00」在表上的高度就是不一样的 ——
 * 这是它区别于「清单」的地方：看的是**时间被占用的形状**，而不只是有哪些事。
 *
 * 三个刻意的设计：
 * - **窗口固定，不随数据收窄**。收窄会让同一门课上周在第 3 行、这周在第 5 行，
 *   而课程表的价值恰恰是跨周可比；且跨度小时块会更挤，文字互相压住。
 *   窗口本身（起止、间隔）则交给用户自定义，默认 06:00–24:00 / 2 小时。
 * - **只保留横向分割线、且画在内容之下**（先渲染 = 最底层）。竖线已按需求删除；
 *   横线若画在块之上会被色块遮住，故改最底层 —— 块的**不透明底色**盖住它，
 *   只在块与块的空隙里透出来。网格仍是骨架，但绝不遮挡事件色块。
 * - **列宽平均分配、不横向滚动**。一周要能一眼看完，横向滚动会让「周三下午很满」
 *   这种整体判断失效。左侧时间轴刻意收窄（只留数字、整体左贴卡片边），把横向空间
 *   尽量让给七列；块内文字**按时间块高度自动换行、末尾省略（…）**而非单行硬截断 ——
 *   既不压到相邻块，又把任务名读全。
 */
export function WeekTimetable({
  weekDays,
  cells,
  todayKey,
  timeWindow = WEEK_WINDOW,
  tickStepHours = TICK_STEP_HOURS,
  onSelectSlot,
  onSelectEmpty,
}: WeekTimetableProps) {
  // 板块配色取用户自定义后的配置（改了色，课程表里的块跟着变）
  const sectionConfigs = useSectionConfigs();
  const ticks = gridTicks(timeWindow, tickStepHours);
  /** 空格点击区仍按一小时细分：预填更准，且不影响自定义间隔的分割线 */
  const clickTicks = gridTicks(timeWindow, 1);
  const span = timeWindow.endMin - timeWindow.startMin;
  const hours = span / 60;
  const height = hours * HOUR_HEIGHT;
  /** 某分钟在网格里的纵向百分比 */
  const percentOf = (min: number) => ((min - timeWindow.startMin) / span) * 100;

  return (
    <div className="rounded-card bg-surface border border-surface-line overflow-hidden">
      {/* 表头：周几 + 几号 */}
      <div className="flex border-b border-surface-line">
        <div className="w-7 shrink-0" />
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
        {/*
          左：时间刻度列。上下留 **外边距**（mt-4 mb-4，不是 padding）——
          绝对定位的子元素相对「padding box」定位，padding 不会把 06:00 / 24:00 的
          端点标签从边缘推开，所以得用 margin 把整段网格推出卡片内沿，端点标签才有
          不被裁掉的空白。网格线同样因此落在「06 之前 / 24 之后」的留白里。
        */}
        <div className="relative w-7 shrink-0 mt-4 mb-4" style={{ height }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-1 -translate-y-1/2 text-caption text-ink-faint tabular-nums"
              style={{ top: `${percentOf(tick)}%` }}
            >
              {tickLabel(tick).slice(0, 2)}
            </span>
          ))}
        </div>

        {/* 右：七列网格（与左列同 margin，端点标签与分割线对齐） */}
        <div className="relative flex-1 mt-4 mb-4" style={{ height }}>
          {/* 空格点击区：每列每整点一格（比分割线更细，预填更准） */}
          {weekDays.map((dateKey, dayIndex) =>
            clickTicks.slice(0, -1).map((tick) => (
              <button
                key={`${dateKey}-${tick}`}
                type="button"
                onClick={() => onSelectEmpty(dateKey, tick)}
                aria-label={`${dateKey} ${tickLabel(tick)} 添加时间段`}
                className="absolute press"
                style={{
                  left: `${(dayIndex / 7) * 100}%`,
                  width: `${100 / 7}%`,
                  top: `${percentOf(tick)}%`,
                  height: HOUR_HEIGHT,
                }}
              />
            )),
          )}

          {/*
            横向分割线画在内容之下（先渲染 = 处于最底层）：时间块的不透明底色会盖住它，
            只在块与块的空隙里透出来 —— 网格是骨架，但绝不能遮住事件色块。
            用 border-t + border-dashed 渲染成点划线；pointer-events-none 不挡点击。
          */}
          {ticks.map((tick) => (
            <span
              key={`h-${tick}`}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-surface-line pointer-events-none"
              style={{ top: `${percentOf(tick)}%` }}
            />
          ))}

          {/* 时间块 */}
          {cells.map((cell) => {
            const config = cell.slot.sectionId
              ? (sectionConfigs.find((cfg) => cfg.key === cell.slot.sectionId) ?? null)
              : null;
            const pixelHeight = cell.height * height;
            /*
              块内文字按时间块高度自动决定可显示行数（约 16px/行），超出则在末尾以
              「…」省略 —— 既不压到相邻块，又把任务名读全。时间由块在纵轴上的位置
              本身就表达，所以不再单独画一行时间。
            */
            const lineClamp = Math.max(1, Math.floor((pixelHeight - 4) / LINE_PX));
            return (
              <button
                key={cell.slot.id}
                type="button"
                onClick={() => onSelectSlot(cell.slot)}
                className={clsx(
                  'absolute press overflow-hidden rounded-[3px] px-1 text-left',
                  cell.slot.done && 'opacity-60',
                )}
                style={{
                  left: `${((cell.dayIndex + cell.lane / cell.laneCount) / 7) * 100}%`,
                  width: `${(1 / cell.laneCount / 7) * 100}%`,
                  top: `${cell.top * 100}%`,
                  height: `${cell.height * 100}%`,
                  minHeight: 18,
                  paddingTop: 2,
                  paddingBottom: 2,
                  backgroundColor: config
                    ? sectionTint(config)
                    : 'rgb(var(--c-surface-sunken))',
                  borderLeft: `2.5px solid ${
                    config ? sectionColor(config) : 'rgb(var(--c-edge-strong))'
                  }`,
                }}
              >
                <span
                  className={clsx(
                    'block text-caption leading-4 break-words',
                    cell.slot.done ? 'text-ink-faint line-through' : 'text-ink',
                  )}
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: lineClamp,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
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
