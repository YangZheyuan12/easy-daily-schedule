import clsx from 'clsx';
import { useUiStore } from '@/store/useUiStore';

/** 全局轻提示。渲染在最上层，不拦截点击。 */
export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-14 z-[60] flex flex-col items-center gap-2 px-6 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            // 从上方落下 10px + 淡入：比纯淡入更容易被余光捕捉到（轻提示的价值全在「被看见」）
            'm-rise max-w-full rounded-full px-4 py-2 text-body shadow-lg',
            toast.tone === 'error' ? 'bg-heart text-accent-fg' : 'bg-accent text-accent-fg',
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
