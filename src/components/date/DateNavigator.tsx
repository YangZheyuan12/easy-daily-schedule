import clsx from 'clsx';
import { useState } from 'react';
import { formatDateLabel, isToday, todayKey } from '@/utils/date';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';

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
 * 「回到今天」没有因此消失 —— 它既在切换浮层里（**只在看的不是今天时**出现，
 * 今天时它是废操作，还会把菜单撑宽），也在**看的是别的日子且处于天视图时
 * 直接顶掉胶囊**（此时「回到今天」才是用户最可能做的事，藏进菜单里是白白多一步）。
 * 中间日期在周视图下改由 `centerLabel` 显示整周范围：
 * 周视图里显示「10月14日」会让人以为看到的只是那一天。
 *
 * 切换菜单用 `Popover`（右上角方格，从右上角向右下展开）而不是 `Sheet`：
 * 日期切换是「一眼扫过、一步选完」的操作，从屏幕底部升起的抽屉会把视线
 * 从页面顶部拉到另一头，选完还得等它滑下去。
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
  /** 天视图且看的不是今天 → 右上角直接给「回到今天」（顶掉视图切换胶囊） */
  const showBackToToday = modeSwitch && mode === 'day' && !today;

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
    <div className="flex items-center justify-between gap-1 px-5 pt-[calc(8px+env(safe-area-inset-top))] pb-1">
      {/*
        🔴 左侧这一组吃掉**除右侧胶囊外的全部宽度**（`flex-1`），中间日期槽再 `flex-1`。
        原来中间那一格是按内容自适应的：日期文案宽度会随「9 日 → 10 日」「9 月 → 10 月」
        变化（少一个数字就窄 13px），于是每翻一天，左右两个箭头都会跟着左右挪一下 ——
        这就是用户说的「切到别的日期，日期排版就会乱」（2026-10-17）。
        现在箭头的横向位置只由容器宽度决定，与当天是几月几号无关。
        文案本身保留 `truncate`：万一遇上特别窄的屏幕，宁可省略号也不要撑破导航栏。
      */}
      <div className="flex items-center -ml-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={onPrev}
          className="press shrink-0 min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
          aria-label={mode === 'week' ? '上一周' : '前一天'}
        >
          <Icon name="chevron-left" size={20} />
        </button>

        <button
          type="button"
          onClick={onDateClick ?? onToday}
          className="press flex-1 min-w-0 min-h-tap px-1 flex items-center justify-start active:opacity-60"
          aria-label={clickable ? '点击选择日期' : today ? '今天是' + formatDateLabel(date) : '回到今天'}
        >
          {/* key=date：换日期时重挂，让方向动画重放（同一个 DOM 节点上不会重播已播完的动画） */}
          {hasSubtitle ? (
            <span
              key={centerText}
              className={clsx(
                'flex flex-col items-start min-w-0 max-w-full',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              <span className="text-title font-semibold text-ink tracking-tight truncate max-w-full">
                {centerText}
              </span>
              {/* 副标题：与主日期同处一个动画块，切日期时一起滑入 / 滑出 */}
              <span className="text-caption text-ink-faint truncate max-w-[42vw]">{subtitleText}</span>
            </span>
          ) : hasCenterLabel ? (
            /* 周范围：字号降一档 + 不折行，否则「10月12日–18日」会把导航撑成两行 */
            <span
              key={centerText}
              className={clsx(
                'text-heading font-semibold text-ink tracking-tight whitespace-nowrap truncate max-w-full',
                direction === 0 ? 'm-fade' : direction > 0 ? 'm-slide-right' : 'm-slide-left',
              )}
            >
              {centerText}
            </span>
          ) : (
            <span
              key={centerText}
              className={clsx(
                'text-title font-semibold text-ink tracking-tight whitespace-nowrap truncate max-w-full',
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
          className="press shrink-0 min-w-tap min-h-tap flex items-center justify-center text-ink-soft"
          aria-label={mode === 'week' ? '下一周' : '后一天'}
        >
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      {modeSwitch ? (
        /*
          天视图 + 看的不是今天 → 右上角直接是「回到今天」。
          这时用户下一步几乎必然是回今天，把它藏进菜单等于逼人多点一次；
          重音实色是因为它此刻就是这一屏的主操作。

          🔴 文案写成「今天」而不是「回到今天」：导航条这一行的横向预算是死的
          （‹ › 各 44px + 日期最多约 152px），360px 宽的机器上四个字会把日期挤到
          只剩省略号 —— 反过来才是「排版乱」。回到今天的语义由 ↺ 图标表达，
          无障碍名与浮层里那一行仍然写完整的「回到今天」。
        */
        showBackToToday ? (
          <BackToTodayPill onClick={onToday} />
        ) : (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSwitchOpen(true)}
              className="press shrink-0 min-h-[34px] px-3.5 rounded-pill bg-surface-sunken text-meta text-ink inline-flex items-center gap-1"
              aria-label="切换当日 / 本周视图"
              aria-expanded={switchOpen}
            >
              {mode === 'day' ? '当日' : '本周'}
              <Icon name="chevron-down" size={13} />
            </button>

            <Popover
              open={switchOpen}
              onClose={() => setSwitchOpen(false)}
              /*
                只有两项时收窄到 104px；多出「回到今天」那一行要放宽。
                🔴 184px 是量出来的，不是拍的：面板 `p-1`(8px) + 行 `px-2`(16px)
                吃掉 24px，剩给文字 160px；而「回到今天」(body 15px×4 字≈60px)
                +「10月28日 周三」(caption 13px≈84px) 约 144px —— 150px 时
                超出约 18px，正好把最后一个字挤到下一行。
              */
              width={today ? '104px' : '184px'}
              label="视图范围"
            >
              {(
                [
                  ['day', '当日'],
                  ['week', '本周'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    onViewModeChange?.(key);
                    setSwitchOpen(false);
                  }}
                  className={clsx(
                    'press w-full min-h-[40px] px-2 rounded-sm flex items-center justify-between',
                    mode === key ? 'text-accent' : 'text-ink',
                  )}
                >
                  <span className="text-body">{label}</span>
                  {mode === key && <Icon name="check" size={15} strokeWidth={2.4} />}
                </button>
              ))}

              {/*
                「回到今天」只在看的不是今天时出现。
                今天时这一行是纯粹的噪音（点了什么都不会变），而且右侧那句
                「10月15日周四」会把菜单撑到和触发按钮一样宽、把上面的「当日/本周」
                挤成两行（用户反馈的占位错乱）。所以整行（连同分隔线）一起收掉。
              */}
              {!today && (
                <>
                  <div className="my-1 h-px bg-surface-line" />

                  <button
                    type="button"
                    onClick={() => {
                      onToday();
                      setSwitchOpen(false);
                    }}
                    className="press w-full min-h-[40px] px-2 rounded-sm flex items-center justify-between gap-2 text-ink"
                  >
                    {/* nowrap 兜底：万一字号/字体在不同机型上变宽，宁可顶到边缘也不要折行 */}
                    <span className="text-body whitespace-nowrap">回到今天</span>
                    {/* 🔴 严禁 toISOString().slice(0,10)（UTC 推移会差一天）—— 一律走 todayKey */}
                    <span className="text-caption text-ink-faint tabular-nums whitespace-nowrap">
                      {formatDateLabel(todayKey())}
                    </span>
                  </button>
                </>
              )}
            </Popover>
          </div>
        )
      ) : today ? (
        <button
          type="button"
          onClick={onToday}
          className="press shrink-0 min-h-[34px] px-3.5 rounded-pill bg-surface-sunken text-meta text-ink-faint inline-flex items-center whitespace-nowrap"
          aria-label="回到今天"
        >
          今天
        </button>
      ) : (
        /*
          无视图切换的用法（任务页）：看的就是今天时保持中性灰胶囊（点了没变化，
          不该抢主操作的视觉重量）；一旦翻到别的日子，右上角换成与今日页一致的
          「回到今天」重音胶囊 —— 此时回今天就是用户最可能做的事。
        */
        <BackToTodayPill onClick={onToday} />
      )}
    </div>
  );
}

/**
 * 「回到今天」重音胶囊（↺ + 今天）。
 *
 * 文案固定写「今天」而不是「回到今天」：导航条这一行的横向预算是死的
 * （‹ › 各 44px + 日期最多约 152px），360px 宽的机器上四个字会把日期挤到
 * 只剩省略号 —— 反过来才是「排版乱」。回到今天的语义由 ↺ 图标表达，
 * 无障碍名与 title 仍然写完整的「回到今天」。
 */
function BackToTodayPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press shrink-0 min-h-[34px] px-3.5 rounded-pill bg-accent text-meta text-accent-fg shadow-glow inline-flex items-center gap-1 whitespace-nowrap"
      aria-label="回到今天"
      title="回到今天"
      data-testid="back-to-today"
    >
      <Icon name="undo" size={13} />
      今天
    </button>
  );
}
