import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
} from 'react';
import clsx from 'clsx';
import { minToHHMM } from '@/utils/date';

/**
 * 时间刻度尺（Time ruler）。
 *
 * 为什么不用原生 `<input type="time">`：
 * ① 它在桌面端弹出的是系统小面板，样式完全不跟主题，是整套 UI 里唯一的「外来物」；
 * ② 手机端是滚轮弹窗，盖住半个屏幕且无法一次看到「前后各几小时」的上下文，
 *    而排时间段恰恰需要这个上下文（「上一个到 10:30，这个从 11:00 开始吧」）。
 *
 * 交互模型（三条，都是显式的，不用猜）：
 * - **拖动**：鼠标按住横向拖（手机上直接横滑，走原生惯性滚动，比 JS 模拟跟手）。
 * - **点击**：点某个刻度就直接选中它。
 * - **滚轮**：`Shift + 滚轮` 或横向滚轮可以浏览；**普通纵向滚轮不做劫持** ——
 *   否则鼠标停在尺子上时抽屉就滚不动了，这是比「少一种浏览方式」严重得多的体验问题。
 *
 * 悬停反馈：刻度在 hover 时**放大并加深**（`scale` + 由 faint 提到 ink），
 * 按下时轻微回缩。选中的刻度是实色填充 —— 「浏览」和「已选中」必须是两种视觉，
 * 否则鼠标划过去会让人以为已经改了值。
 */

/** 分钟步长。5 分钟足够排日程，再细手指点不中、收益也接近零 */
const STEP = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / STEP }, (_, i) => i * STEP);

interface TimeRulerProps {
  /** 当前值（当天第几分钟，0–1439） */
  value: number;
  onChange: (min: number) => void;
  /** 正在编辑的字段标识。**只在它变化时**把选中刻度滚回中间 */
  fieldKey: string;
  /** 字段名（读给屏幕阅读器听，也显示在读数区） */
  fieldLabel: string;
  /**
   * 该字段当前「未设置」（如「结束时间」可以为空）。
   * 此时 `value` 只是**预览值** —— 读数会带「设为」前缀，用户不动刻度就不会写进数据。
   * 诚实地标出这件事，比偷偷填一个值或者显示一个看不懂的种子时间要好。
   */
  pending?: boolean;
}

export function TimeRuler({
  value,
  onChange,
  fieldKey,
  fieldLabel,
  pending = false,
}: TimeRulerProps) {
  // 先收敛成合法值再用。读数、两行刻度的高亮必须**用同一个值**算 ——
  // 否则一个越界值会出现「读数 23:59 但高亮停在 0 分」这种自相矛盾的画面。
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  // 存量数据可能是任意分钟（老的原生输入框存过 09:07）。
  // 高亮「最近的那个刻度」而不是硬把值改掉 —— 打开抽屉不该悄悄改数据。
  const nearMinute = Math.min(55, Math.round(minute / STEP) * STEP);

  const setHour = (next: number) => onChange(next * 60 + minute);
  const setMinute = (next: number) => onChange(hour * 60 + next);

  return (
    <div className="mt-1.5 rounded-sm bg-surface-sunken overflow-hidden">
      {/* 读数：两行刻度各自只显示「时」和「分」，合起来是什么时候必须能一眼确认 */}
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-caption text-ink-muted">
          {fieldLabel}
          {pending && <span className="ml-1 text-ink-faint">未设置</span>}
        </span>
        <span
          className={clsx(
            'text-lead font-semibold tabular-nums',
            pending ? 'text-ink-faint' : 'text-accent',
          )}
        >
          {pending && '设为 '}
          {minToHHMM(safe)}
        </span>
      </div>

      <RulerRow
        groupLabel={`${fieldLabel} · 小时`}
        fieldKey={`${fieldKey}-h`}
        options={HOURS}
        selected={hour}
        onSelect={setHour}
        renderLabel={(option) => String(option)}
        labelOf={(option) => `${option} 点`}
        strong
      />

      <RulerRow
        groupLabel={`${fieldLabel} · 分钟`}
        fieldKey={`${fieldKey}-m`}
        options={MINUTES}
        selected={nearMinute}
        onSelect={setMinute}
        renderLabel={(option) => String(option).padStart(2, '0')}
        labelOf={(option) => `${option} 分`}
      />
    </div>
  );
}

interface RulerRowProps {
  groupLabel: string;
  /** 字段 + 维度（时 / 分）：它变了才复位滚动位置 */
  fieldKey: string;
  options: readonly number[];
  selected: number;
  onSelect: (option: number) => void;
  renderLabel: (option: number) => ReactNode;
  labelOf: (option: number) => string;
  /** 小时行比分钟行重一档（数字更短、更重要） */
  strong?: boolean;
}

function RulerRow({
  groupLabel,
  fieldKey,
  options,
  selected,
  onSelect,
  renderLabel,
  labelOf,
  strong = false,
}: RulerRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 本次按下事件里指针走过的最大距离：超过阈值后松手不再当点击（否则一拖就误选） */
  const moved = useRef(0);

  /*
    只在「换字段 / 首次挂载」时把选中刻度滚到中间。
    绝不能写成 [selected] 依赖 —— 拖动浏览时值也会变，一依赖它就会和用户的手指抢滚动位置。
  */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const mark = container.querySelector<HTMLElement>('[data-selected="true"]');
    if (!mark) return;
    container.scrollLeft = mark.offsetLeft - (container.clientWidth - mark.offsetWidth) / 2;
  }, [fieldKey]);

  // 滚轮要 preventDefault，而 React 把 wheel 挂成 passive 监听，只能用原生监听覆盖
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onWheel = (event: WheelEvent) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!horizontal && !event.shiftKey) return; // 纵向滚轮让给抽屉自己滚
      container.scrollLeft += horizontal ? event.deltaX : event.deltaY;
      event.preventDefault();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    // 触摸交给原生横向滚动（带惯性，比 JS 跟手），鼠标才需要自己实现拖拽
    if (event.pointerType === 'touch') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const startX = event.clientX;
    const startScroll = container.scrollLeft;
    moved.current = 0;

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      moved.current = Math.max(moved.current, Math.abs(dx));
      container.scrollLeft = startScroll - dx;
    };
    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    // 用 window 监听而不是 setPointerCapture：一旦 capture，click 会被重定向到捕获元素，
    // 刻度上的 onClick 就永远不触发了（Sheet 顶部的拖拽也踩过同一个坑）。
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  return (
    <div
      ref={scrollRef}
      role="group"
      aria-label={groupLabel}
      onPointerDown={handlePointerDown}
      className={clsx(
        'no-scrollbar overflow-x-auto overscroll-x-contain',
        'px-3 py-1.5 select-none cursor-grab active:cursor-grabbing',
      )}
    >
      <div className="flex items-center gap-1 w-max">
        {options.map((option) => {
          const isSelected = option === selected;
          return (
            <button
              key={option}
              type="button"
              data-selected={isSelected}
              aria-pressed={isSelected}
              aria-label={labelOf(option)}
              onClick={() => {
                if (moved.current > 6) return; // 刚才是拖，不是点
                onSelect(option);
              }}
              className={clsx(
                'shrink-0 rounded-sm flex items-center justify-center tabular-nums',
                'transition-[transform,background-color,color,box-shadow] duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
                // 两行刻度同字号（16px），只靠高度和选中态区分主次 ——
                // 分钟被压小一档后，选中它时读者会以为自己点错了行
                'w-[50px] text-lead',
                strong ? 'h-[42px]' : 'h-[38px]',
                isSelected
                  ? 'bg-accent text-accent-fg font-semibold shadow-card'
                  : clsx(
                      'text-ink-faint',
                      // 悬停 = 放大 + 加深：鼠标划过时能明确知道「这一格会被选中」
                      'hover:bg-surface hover:text-ink hover:scale-[1.14] hover:shadow-card',
                    ),
                'active:scale-[0.98]',
              )}
            >
              {renderLabel(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
