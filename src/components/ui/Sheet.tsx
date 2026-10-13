import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/** 退场时长：与 CSS 的 `--m-dur-2` 对齐（JS 读不到变量，改一处要改两处） */
const EXIT_MS = 200;
/** 下拉超过面板高度的这个比例就关闭 */
const DISMISS_RATIO = 0.28;
/** 或者甩得够快也算关闭（px/ms）—— 手感上「轻甩」比「拖到底」更常用 */
const DISMISS_VELOCITY = 0.55;

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** 右侧操作区（如「完成」按钮） */
  action?: ReactNode;
  children: ReactNode;
  /** 最大高度占比，默认 85vh */
  maxHeight?: string;
}

/**
 * 底部抽屉。
 *
 * 移动端最顺手的详情交互：从底部升起，高度不超过 85vh，内部可滚动，
 * 点遮罩或**下拉**关闭。
 *
 * 三处手感处理：
 * 1. **退场动画**。`open` 变 false 后先播完 200ms 下滑再卸载 ——
 *    瞬间消失的抽屉会让人怀疑「我是不是误触了」。
 * 2. **下拉关闭**。从抓手 / 标题区起手跟随手指，松手时按「距离或速度」判断是否关闭，
 *    不关则弹回。起手点落在按钮上时不接管（否则顶部「保存」会被拖拽吃掉）。
 * 3. 拖拽过程中遮罩跟着变淡，让「拖到一半松手」这件事的后果是可见的。
 */
export function Sheet({ open, onClose, title, action, children, maxHeight = '85vh' }: SheetProps) {
  const [phase, setPhase] = useState<'idle' | 'in' | 'out'>(open ? 'in' : 'idle');
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startY: 0, startAt: 0, y: 0 });

  // 进 / 退场：退场要等动画播完再卸载
  useEffect(() => {
    if (open) {
      setPhase('in');
      setDragY(0);
      return;
    }
    setPhase((current) => (current === 'in' ? 'out' : current));
    const timer = setTimeout(() => setPhase('idle'), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // 打开时锁定背景滚动，避免抽屉后面的页面跟着动
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // 顶部操作按钮（保存 / 完成）不参与拖拽：setPointerCapture 会把 click 也一起重定向过来
    if ((event.target as HTMLElement).closest('button')) return;
    drag.current = { active: true, startY: event.clientY, startAt: performance.now(), y: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return;
    const dy = Math.max(0, event.clientY - drag.current.startY);
    drag.current.y = dy;
    setDragY(dy);
  };

  const handlePointerUp = () => {
    if (!drag.current.active) return;
    const { y, startAt } = drag.current;
    drag.current.active = false;
    setDragging(false);

    const elapsed = Math.max(1, performance.now() - startAt);
    const height = panelRef.current?.offsetHeight ?? 600;
    if (y > height * DISMISS_RATIO || y / elapsed > DISMISS_VELOCITY) {
      onClose();
      return;
    }
    setDragY(0);
  };

  if (phase === 'idle') return null;
  const closing = phase === 'out';

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      // 键盘弹起时整块面板抬到键盘上方（--keyboard-offset 由 useKeyboardAvoid 写入，
      // 没有键盘时变量不存在 → 回落 0px，布局与加这个功能之前完全一致）
      style={{ paddingBottom: 'var(--keyboard-offset, 0px)' }}
    >
      <div
        className={clsx('absolute inset-0 bg-black/40', closing ? 'm-fade-out' : 'm-fade')}
        style={dragY > 0 && !closing ? { opacity: Math.max(0.25, 1 - dragY / 300) } : undefined}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={clsx(
          'relative w-full max-w-[430px] bg-surface rounded-t-sheet shadow-xl flex flex-col',
          closing ? 'm-sheet-down' : 'm-sheet-up',
        )}
        style={{
          // 抬起来之后可用高度也少了键盘那一截，否则面板顶端会顶出屏幕
          maxHeight: `calc(${maxHeight} - var(--keyboard-offset, 0px))`,
          transform: dragY > 0 && !closing ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform var(--m-dur-3) var(--m-ease-out)',
        }}
        role="dialog"
        aria-modal="true"
      >
        {/* 抓手 + 标题区：下拉关闭的起手区（抓手够不到时整条标题也能拖） */}
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="flex justify-center pt-2 pb-1">
            <div
              className={clsx(
                'h-1 rounded-full transition-all duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
                dragY > 0 ? 'w-12 bg-edge-strong' : 'w-10 bg-surface-line',
              )}
            />
          </div>

          {(title || action) && (
            <div className="flex items-center justify-between px-4 py-2 border-b border-surface-line">
              <div className="text-heading font-semibold text-ink truncate">{title}</div>
              <div className="flex items-center gap-1">{action}</div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

interface SheetActionButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

/**
 * 抽屉右上角的主操作按钮（保存 / 完成）。
 *
 * 之前这里是个裸的 `<span>保存</span>` 式文字按钮 —— 有两个实际问题：
 * ① 没有禁用态，内容为空时点下去**什么都不会发生也没有任何解释**；
 * ② 和标题比起来太轻，不像「这一步的终点」。
 * 现在做成实心胶囊：可保存时用重音实色，不可保存时降级成下沉底弱文字（可点但不承诺结果）。
 */
export function SheetActionButton({ onClick, disabled = false, children }: SheetActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'press min-h-[38px] px-4 rounded-pill text-body font-medium',
        'transition-colors duration-[var(--m-dur-2)] ease-[var(--m-ease-out)]',
        disabled ? 'bg-surface-sunken text-ink-faint' : 'bg-accent text-accent-fg shadow-glow',
      )}
    >
      {children}
    </button>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 居中确认弹窗。
 *
 * 只做进场（遮罩淡入 + 面板轻弹），不做退场 —— 它总是由一个明确的选择关闭，
 * 紧接着会有 Toast / 撤销条给出反馈，退场动画反而会拖慢这条路径。
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40 m-fade" onClick={onCancel} aria-hidden />
      <div className="relative w-full max-w-[320px] bg-surface rounded-sheet overflow-hidden m-pop-soft">
        <div className="px-5 pt-5 pb-4">
          <div className="text-heading font-semibold text-ink text-center">{title}</div>
          {description && (
            <div className="mt-2 text-body leading-6 text-ink-muted text-center">{description}</div>
          )}
        </div>
        <div className="flex border-t border-surface-line">
          <button
            className="press flex-1 min-h-tap text-lead text-ink-muted"
            onClick={onCancel}
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={clsx(
              'press flex-1 min-h-tap text-lead font-medium border-l border-surface-line',
              danger ? 'text-heart' : 'text-accent',
            )}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
