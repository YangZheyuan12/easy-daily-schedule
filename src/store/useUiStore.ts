import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

interface UiState {
  /** 底部抽屉当前展示的条目 id；null 表示关闭 */
  drawerItemId: string | null;
  toasts: Toast[];
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

/** 纯 UI 态：不持久化，刷新即重置。 */
export const useUiStore = create<UiState>((set, get) => ({
  drawerItemId: null,
  toasts: [],

  openDrawer: (id) => set({ drawerItemId: id }),
  closeDrawer: () => set({ drawerItemId: null }),

  pushToast(message, tone = 'info') {
    toastSeq += 1;
    const toast: Toast = { id: toastSeq, message, tone };
    set({ toasts: [...get().toasts, toast] });
    // 2.6 秒后自动消失，与撤销条的 5 秒窗口区分开
    setTimeout(() => get().dismissToast(toast.id), 2600);
  },

  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
