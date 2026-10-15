import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

/** 退场时长：与 `.m-pop-tr-out` 的 `--m-dur-1` 对齐（JS 读不到 CSS 变量） */
const EXIT_MS = 120;

interface PopoverPosition {
  top: number;
  left?: number;
  right?: number;
}

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 面板宽度（默认 176px，够放「当日 / 本周 + 回到今天」两行带提示的项） */
  width?: string;
  /** 无障碍标签 */
  label?: string;
  /**
   * 对齐方式：`right` 贴触发按钮右缘（默认，给屏幕右上角的控件用）；
   * `left` 贴左缘（给行内左侧的控件用，如任务行的「分组」胶囊）。
   * 两者不只是换个定位类 —— 展开动效的 transform-origin 也要镜像
   * （右上角 ↔ 左上角），否则气泡会从角外「滑」进来而不是从角上长出来。
   */
  align?: 'left' | 'right';
  /**
   * 触发按钮的 ref。**传了就走 portal + fixed 定位**（气泡挂到 body 上，
   * 贴着按钮的实时位置），不传则保持 `absolute`（相对调用方的 relative 容器）。
   *
   * 为什么需要这条退路：页面里到处是 `m-rise`（动画期间 transform 会造出
   * 层叠上下文）、`fixed` 的悬浮按钮与底栏（z-30），`absolute + z-50` 的
   * 气泡会被它们盖住 —— 用户实测「点分组，弹出的气泡被挡住了」。
   * portal 到 body 后气泡与页面元素彻底分开，只受 z-index 约束，
   * 滚动时还会跟着按钮走（`scroll` 捕获段监听 + 触底自动向上翻转）。
   */
  anchorRef?: RefObject<HTMLElement | null>;
}

/**
 * 锚定在触发按钮旁的气泡浮层（替代底部抽屉的小菜单）。
 *
 * 为什么不用 `Sheet`：这类操作是「一眼扫过、一步选完」的，
 * 从屏幕底部升起的抽屉会把手势焦点拉到屏幕另一头，选完还得等它滑下去。
 * 浮层就长在按钮旁边，视线不用来回跑。
 *
 * 退场要真播完再卸载（同 `Sheet` 的做法）：瞬间消失的浮层会让人怀疑误触。
 */
export function Popover({
  open,
  onClose,
  children,
  width = '176px',
  label,
  align = 'right',
  anchorRef,
}: PopoverProps) {
  const [phase, setPhase] = useState<'idle' | 'in' | 'out'>(open ? 'in' : 'idle');
  const [pos, setPos] = useState<PopoverPosition | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 上一次摆放的位置：相同就不再 setState，否则 layout effect 会无限重入 */
  const posRef = useRef<PopoverPosition | null>(null);

  useEffect(() => {
    if (open) {
      setPhase('in');
      // 重新打开先清掉旧位置：面板以不可见态挂一帧，摆好再显形，不会闪在旧址
      posRef.current = null;
      setPos(null);
      return;
    }
    setPhase((current) => (current === 'in' ? 'out' : current));
    const timer = setTimeout(() => setPhase('idle'), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  /*
    锚定模式：每次渲染后都重新量一次（无依赖数组是刻意的 —— 面板高度会随
    内容变，且 `pos` 变化本身也会触发重跑，靠 posRef 判重防循环）。
    首帧 panelRef 已有高度（layout effect 在 commit 后、 paint 前跑），
    所以正常情况不会有「先画在错位置再跳」的一帧。
  */
  useLayoutEffect(() => {
    if (phase === 'idle' || !anchorRef) return;

    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 0;
      // 下方放不下且上方放得下 → 向上翻转（贴住按钮上沿，留 6px 缝隙）
      const fitsBelow = rect.bottom + 6 + height <= window.innerHeight - 8;
      const fitsAbove = rect.top - 6 - height >= 8;
      const next: PopoverPosition = {
        top: !fitsBelow && fitsAbove ? Math.max(8, rect.top - 6 - height) : rect.bottom + 6,
        left: align === 'left' ? rect.left : undefined,
        right: align === 'right' ? window.innerWidth - rect.right : undefined,
      };
      const prev = posRef.current;
      if (
        prev &&
        prev.top === next.top &&
        prev.left === next.left &&
        prev.right === next.right
      ) {
        return;
      }
      posRef.current = next;
      setPos(next);
    };

    place();
    // 兜底：等一帧再量一次（首帧面板可能还没完成布局）
    const raf = requestAnimationFrame(place);
    // 捕获段监听：页面在任何可滚动容器里滚动，气泡都要跟着按钮走
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  });

  if (phase === 'idle') return null;

  const panelClass = clsx(
    'bg-surface border border-surface-line rounded-card shadow-card p-1',
    phase === 'out'
      ? align === 'left'
        ? 'm-pop-tl-out'
        : 'm-pop-tr-out'
      : align === 'left'
        ? 'm-pop-tl'
        : 'm-pop-tr',
  );

  const overlay = <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />;

  // 无锚点：保持旧的 absolute 行为（相对调用方的 relative 容器，右上角控件用）
  if (!anchorRef) {
    return (
      <>
        {overlay}
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          className={clsx(
            'absolute top-full mt-1.5 z-50',
            align === 'left' ? 'left-0' : 'right-0',
            panelClass,
          )}
          style={{ width }}
        >
          {children}
        </div>
      </>
    );
  }

  /*
    有锚点：portal 到 body + fixed。
    z-[55]：高于底栏（z-30）与各页的 fixed 悬浮按钮，低于 toast（z-60）。
    `pos` 未就绪前不可见 —— 摆好再显形，避免在按钮原地闪一下。
  */
  return createPortal(
    <>
      {overlay}
      <div
        ref={panelRef}
        role="menu"
        aria-label={label}
        className={clsx('fixed z-[55]', panelClass)}
        style={{
          width,
          top: pos?.top ?? 0,
          left: pos?.left,
          right: pos?.right,
          visibility: pos ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
