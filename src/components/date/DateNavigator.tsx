import clsx from 'clsx';
import { useState } from 'react';
import { formatDateLabel, isToday } from '@/utils/date';
import { Icon } from '@/components/ui/Icon';

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
 */
export function DateNavigator({
  date,
  onPrev,
  onNext,
  onToday,
  onDateClick,
  subtitleText,
}: DateNavigatorProps) {
  const today = isToday(date);
  const clickable = onDateClick !== undefined;
  // 空串与 undefined 同等对待：都视为「没有副标题」，保证旧调用的 DOM 不变
  const hasSubtitle = typeof subtitleText === 'string' && subtitleText.length > 0;

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

  return (
    <div className="flex items-center justify-between px-5 pt-[calc(8px+env(safe-area-inset-top))] pb-1">
      <div className="flex items-center -ml-2">
        <button
          type="button"
          onClick={onPrev}
          className="press min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
          aria-label="前一天"
        >
          <Icon name="chevron-left" size={20} />
        </button>

        <button
          type="button"
          onClick={onDateClick ?? onToday}
          className={clsx(
            'min-h-tap px-1 flex items-center active:opacity-60',
            // 仅在带副标题时才允许收缩，保证无副标题时 class 与旧版逐字一致
            hasSubtitle && 'min-w-0',
          )}
          aria-label={clickable ? '点击选择日期' : today ? '今天是' + formatDateLabel(date) : '回到今天'}
        >
          {/* key=date：换日期时重挂，让方向动画重放（同一个 DOM 节点上不会重播已播完的动画） */}
          {hasSubtitle ? (
            <span
              key={date}
              className={clsx(
                'flex flex-col items-start min-w-0',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              <span className="text-title font-semibold text-ink tracking-tight">
                {formatDateLabel(date)}
              </span>
              {/* 副标题：与主日期同处一个动画块，切日期时一起滑入 / 滑出 */}
              <span className="text-caption text-ink-faint truncate max-w-[42vw]">{subtitleText}</span>
            </span>
          ) : (
            <span
              key={date}
              className={clsx(
                'text-title font-semibold text-ink tracking-tight',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              {formatDateLabel(date)}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onNext}
          className="press min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
          aria-label="后一天"
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

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
    </div>
  );
}
