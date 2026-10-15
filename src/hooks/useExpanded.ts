import { useCallback } from 'react';
import { useUiStore } from '@/store/useUiStore';

/**
 * 跨页保持的展开 / 收起状态。
 *
 * 为什么不用 `useState`：切 Tab 会卸载页面组件，本地 state 跟着灰飞烟灭 ——
 * 用户展开着「期限任务」去了一趟日历，回来它又缩回去了，每次都得重点一遍。
 * 状态放 `useUiStore.expansions` 里，组件只是它的一个视图。
 *
 * 约定：
 * - `key` 必须**稳定且全局唯一**（同一处 UI 每次渲染都算出同一个 key）：
 *   页面级用 `tasks:deadline` / `me:appearance` 这类命名空间，
 *   列表行级用 `images:{itemId}`。
 * - `defaultOpen` 是「用户没表达过意愿时」的初始值，只在 store 里没有该 key 时生效；
 *   用户点过一次之后，以 store 为准（收起也是明确表达）。
 * - 不落盘：刷新重置，与 store 里其它 UI 态（drawerItemId / toasts）一致。
 *   用户要的是「切过去再回来不丢」，不是「明天打开还是展开的」。
 */
export function useExpanded(key: string, defaultOpen = false) {
  const stored = useUiStore((s) => s.expansions[key]);
  const open = stored ?? defaultOpen;

  const toggle = useCallback(() => {
    // 读 getState() 而不是闭包里的 open：连续两次点击之间 state 可能已变
    const current = useUiStore.getState().expansions[key] ?? defaultOpen;
    useUiStore.getState().setExpanded(key, !current);
  }, [key, defaultOpen]);

  return { open, toggle };
}
