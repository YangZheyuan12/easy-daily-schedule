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
  /**
   * 展开 / 收起状态：key → 是否展开。
   *
   * 🔴 切 Tab 会卸载页面组件，`useState` 存的展开态会丢（2026-10-16 用户要求：
   * 展开着期限任务切去日历再回来，它还得是展开的）。所以这类状态放 store 里，
   * 与 drawerItemId 同理 —— 都是「当前会话进行到哪」的 UI 态。
   * 刷新即重置（不落盘）：与其它 UI 态一致，见文件底注释。
   */
  expansions: Record<string, boolean>;
  setExpanded: (key: string, open: boolean) => void;
  /**
   * 已收起的提醒横幅 key（内容派生：日期 + 到期时间段 id 集合）。
   * 与 expansions 分开是因为语义相反 —— 这里是「true = 已打发走」。
   * 新时段到期后集合变化 → key 变了 → 横幅自动重新出现。
   */
  dismissedReminder: string | null;
  dismissReminder: (key: string) => void;
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
  expansions: {},
  dismissedReminder: null,

  setExpanded: (key, open) =>
    set((state) => ({ expansions: { ...state.expansions, [key]: open } })),
  dismissReminder: (key) => set({ dismissedReminder: key }),

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
