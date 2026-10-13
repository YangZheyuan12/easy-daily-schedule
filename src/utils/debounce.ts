export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** 立即执行挂起的调用（切后台、卸载时调用） */
  flush(): void;
  /** 取消挂起的调用 */
  cancel(): void;
  /** 当前是否有挂起的调用 */
  pending(): boolean;
}

/**
 * 防抖。与 lodash 行为一致：延迟期间再次调用会重置计时器。
 * 保留 flush / cancel，供页面生命周期（pagehide / visibilitychange）强制落盘。
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: A | null = null;

  const invoke = () => {
    timer = null;
    const args = lastArgs;
    lastArgs = null;
    if (args) fn(...args);
  };

  const debounced = ((...args: A) => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(invoke, wait);
  }) as Debounced<A>;

  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      invoke();
    }
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  debounced.pending = () => timer !== null;

  return debounced;
}
