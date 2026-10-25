import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

/** 退场时长：与 `.m-fade-out` 的 `--m-dur-2` 对齐（JS 读不到 CSS 变量） */
const EXIT_MS = 160;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 无障碍标签 */
  label?: string;
  /** 点击遮罩是否关闭（默认 true） */
  dismissable?: boolean;
}

/**
 * 居中模态框（对话框）。
 *
 * 与 `Popover`（锚定在按钮旁的小菜单）、`Sheet`（从底部升起）的区别：
 * 它是屏幕正中的卡片，用于「需要专注选择 / 确认」的场景 —— 比如选日期。
 * 视线本就在中间，不需要从角落或底部把注意力拉过去。
 *
 * 退场要真播完再卸载（同 `Popover` / `Sheet`）：瞬间消失的浮层会让人怀疑误触。
 * 进场用 `m-zoom-in`（轻微放大落定），整层再用 `m-fade` 淡入；退场整层 `m-fade-out`。
 */
export function Modal({ open, onClose, children, label, dismissable = true }: ModalProps) {
  const [phase, setPhase] = useState<'idle' | 'in' | 'out'>(open ? 'in' : 'idle');

  useEffect(() => {
    if (open) {
      setPhase('in');
      return;
    }
    setPhase((current) => (current === 'in' ? 'out' : current));
    const timer = setTimeout(() => setPhase('idle'), EXIT_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (phase !== 'in') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  if (phase === 'idle') return null;

  return createPortal(
    <div
      className={clsx(
        'fixed inset-0 z-[60] flex items-center justify-center p-6',
        phase === 'out' ? 'm-fade-out' : 'm-fade',
      )}
      aria-hidden={phase === 'out'}
    >
      {dismissable && (
        <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={clsx(
          'relative z-10 w-full max-w-[340px] bg-surface rounded-card border border-surface-line shadow-card',
          phase === 'in' && 'm-zoom-in',
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
