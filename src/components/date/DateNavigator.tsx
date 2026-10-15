import clsx from 'clsx';
import { useState } from 'react';
import { formatDateLabel, isToday, todayKey } from '@/utils/date';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';

/** 日期维度的视图模式 */
export type DateViewMode = 'day' | 'week';

interface DateNavigatorProps {
  date: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /**
   * 可选：点中间日期时的回调（用于「跳到日历选日子」）。
   * 不传时保持原行为（点日期= 回到今天）。
   */
  onDateClick?: () => void;
  /**
   * 可选：大号日期下方的第二行小字（如「九月初三 · 中秋节」）。
   * 不传 / 空串 → 渲染结果与加此功能前**逐字节一致**（不产生多余 DOM），
   * 以免影响既有布局与快照。
   */
  subtitleText?: string | null;
  /**
   * 可选：启用「当日 / 本周」切换（时间轴与今日页）。
   * 不传 → 右侧保持原来的「今天」胶囊，行为完全不变。
   */
  viewMode?: DateViewMode;
  onViewModeChange?: (mode: DateViewMode) => void;
  /**
   * 可选：中间大字的替代文案（周视图下显示整周范围而不是单日）。
   *
   * 传它时字号降到 `heading`（18px）并锁 `whitespace-nowrap` —— 「10月12日–18日」
   * 这类范围文案比单日日期长得多，用 24px 会被 flex 挤到折行，把导航条撑成两行。
   * 调用方应传 `weekRangeShortLabel()`（同月只写一次月份）而不是 `weekRangeLabel()`。
   */
  centerLabel?: string;
}

/**
 * 日期切换栏（对齐概念稿 C1/C2 的「日期行」）：
 * 左侧 ‹ 大号日期 ›，右侧常驻「今天」胶囊（下沉底、圆胶囊、12px）。
 *
 * 切日期前由调用方负责 flush —— 这里不直接碰持久化，
 * 保持「组件只管渲染与回调」的边界。
 *
 * `onDateClick` 传入后：中间日期改为触发它（如跳日历选日子），
 * 「今天」胶囊始终可达，保证任何时候一键回今天。
 *
 * `onViewModeChange` 传入后：右侧胶囊变成**模式切换**（当日 / 本周）。
 * 「回到今天」没有因此消失 —— 它被放进切换弹窗里，仍然是一步可达。
 * 中间日期在周视图下改由 `centerLabel` 显示整周范围：
 * 周视图里显示「10月14日」会让人以为看到的只是那一天。
 */
export function DateNavigator({
  date,
  onPrev,
  onNext,
  onToday,
  onDateClick,
  subtitleText,
  viewMode,
  onViewModeChange,
  centerLabel,
}: DateNavigatorProps) {
  const today = isToday(date);
  const clickable = onDateClick !== undefined;
  // 空串与 undefined 同等对待：都视为「没有副标题」，保证旧调用的 DOM 不变
  const hasSubtitle = typeof subtitleText === 'string' && subtitleText.length > 0;
  const hasCenterLabel = typeof centerLabel === 'string' && centerLabel.length > 0;

  const [switchOpen, setSwitchOpen] = useState(false);
  const modeSwitch = onViewModeChange !== undefined;
  const mode: DateViewMode = viewMode ?? 'day';

  /*
    日期键是 `YYYY-MM-DD`，字典序即时间序 —— 直接比字符串就知道用户是往前还是往后翻。
    方向由组件自己算（不让三个页面各传一个 direction）：日期是唯一真相源，
    和上一次比一下就够了。

    ⚠️ 方向必须**锁住**。若每次渲染都重算，切日期后 store 陆续到达的几次
    重渲染会把方向算成 0（新日期 == 上一次的日期）→ class 从 m-slide-right
    变回 m-fade，而改 animation-name 会让动画从头重播 ——
    用户看到「滑一半突然变成淡入」。所以用渲染期派生 state 的写法，只在日期真变时改。
  */
  const [previous, setPrevious] = useState(date);
  const [direction, setDirection] = useState(0);
  if (previous !== date) {
    setPrevious(date);
    setDirection(date > previous ? 1 : -1);
  }

  const centerText = centerLabel ?? formatDateLabel(date);

  return (
    <div className="flex items-center justify-between px-5 pt-[calc(8px+env(safe-area-inset-top))] pb-1">
      <div className="flex items-center -ml-2 min-w-0">
        <button
          type="button"
          onClick={onPrev}
          className="press min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
          aria-label={mode === 'week' ? '上一周' : '前一天'}
        >
          <Icon name="chevron-left" size={20} />
        </button>

        <button
          type="button"
          onClick={onDateClick ?? onToday}
          className={clsx(
            'min-h-tap px-1 flex items-center active:opacity-60',
            // 仅在带副标题 / 长范围文案时才允许收缩，保证无副标题时 class 与旧版逐字一致
            (hasSubtitle || hasCenterLabel) && 'min-w-0',
          )}
          aria-label={clickable ? '点击选择日期' : today ? '今天是' + formatDateLabel(date) : '回到今天'}
        >
          {/* key=date：换日期时重挂，让方向动画重放（同一个 DOM 节点上不会重播已播完的动画） */}
          {hasSubtitle ? (
            <span
              key={centerText}
              className={clsx(
                'flex flex-col items-start min-w-0',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              <span className="text-title font-semibold text-ink tracking-tight">{centerText}</span>
              {/* 副标题：与主日期同处一个动画块，切日期时一起滑入 / 滑出 */}
              <span className="text-caption text-ink-faint truncate max-w-[42vw]">{subtitleText}</span>
            </span>
          ) : hasCenterLabel ? (
            /* 周范围：字号降一档 + 不折行，否则「10月12日–18日」会把导航撑成两行 */
            <span
              key={centerText}
              className={clsx(
                'text-heading font-semibold text-ink tracking-tight whitespace-nowrap',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              {centerText}
            </span>
          ) : (
            <span
              key={centerText}
              className={clsx(
                'text-title font-semibold text-ink tracking-tight',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              {centerText}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          className="press min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
          aria-label={mode === 'week' ? '下一周' : '后一天'}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      {modeSwitch ? (
        <button
          type="button"
          onClick={() => setSwitchOpen(true)}
          className="press shrink-0 min-h-[34px] px-3.5 rounded-pill bg-surface-sunken text-meta text-ink inline-flex items-center gap-1"
          aria-label="切换当日 / 本周视图"
        >
          {mode === 'day' ? '当日' : '本周'}
          <Icon name="chevron-down" size={13} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onToday}
          className={clsx(
            'press shrink-0 min-h-[34px] px-3.5 rounded-pill bg-surface-sunken text-meta text-ink-faint',
          )}
          aria-label="回到今天"
        >
          今天
        </button>
      )}

      <Sheet open={switchOpen} onClose={() => setSwitchOpen(false)} title="视图范围">
        <div className="pt-2">
          {(
            [
              ['day', '当日', '一天的时间轴'],
              ['week', '本周', '一周七天 · 课程表'],
            ] as const
          ).map(([key, label, hint]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => {
                onViewModeChange?.(key);
                setSwitchOpen(false);
              }}
              className={clsx(
                'press w-full min-h-tap flex items-center justify-between px-1 rounded-sm',
                mode === key ? 'text-accent' : 'text-ink',
              )}
            >
              <span className="text-lead">{label}</span>
              <span className="text-caption text-ink-faint">{hint}</span>
            </button>
          ))}

          <div className="my-1 h-px bg-surface-line" />

          <button
            type="button"
            onClick={() => {
              onToday();
              setSwitchOpen(false);
            }}
            className="press w-full min-h-tap flex items-center justify-between px-1 rounded-sm text-ink"
          >
            <span className="text-lead">回到今天</span>
            {/* 🔴 严禁 toISOString().slice(0,10)（UTC 推移会差一天）—— 一律走 todayKey */}
            <span className="text-caption text-ink-faint">{formatDateLabel(todayKey())}</span>
          </button>
        </div>
      </Sheet>
    </div>
  );
}
