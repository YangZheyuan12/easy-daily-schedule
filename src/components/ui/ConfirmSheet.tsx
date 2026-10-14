import type { ReactNode } from 'react';
import { Sheet } from './Sheet';

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  /** 说明文字。会写清楚「这件事做完会发生什么、哪些东西不受影响」 */
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 确认抽屉。
 *
 * 为什么不用 `window.confirm`：它是全应用里唯一不跟主题的地方（系统灰白弹窗），
 * 在纸感主题上会突兀得像报错；而且它在 iOS Safari 上会连页面滚动一起锁住。
 *
 * 为什么不做「危险色」确认按钮：本组件当前只服务「同步到今日」这类**中性**动作
 * （可重复、可撤销预期低但也不 destructive），用重音色就够。
 * 真要做删除确认时，应该另加 `tone` 属性而不是把所有确认框都涂红 ——
 * 红色泛滥之后，真正的删除就不再显眼了。
 */
export function ConfirmSheet({
  open,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="pt-3 space-y-4">
        <p className="text-body leading-6 text-ink-muted">{message}</p>

        {/* 并排两个等宽按钮：取消在左（弱），确认在右（重音实色）。
            顺序与 iOS 一致 —— 主操作在右，右手拇指够得着 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="press flex-1 min-h-tap rounded-card border border-surface-line bg-surface text-lead text-ink-muted"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="press flex-1 min-h-tap rounded-card bg-accent text-lead text-accent-fg"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
