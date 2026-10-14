import { create } from 'zustand';
import type { Task } from '@/domain/types';
import type { TaskSectionKey } from '@/domain/enums';
import { OTHER_KEY } from '@/domain/enums';
import { clock, repos } from './bootstrap';
import { persistTasks } from './helper';
import { newTaskId } from '@/services/idService';
import { inheritUnfinishedTasks } from '@/services/inheritService';
import { undoLabel } from '@/services/undoService';
import { shiftDateKey } from '@/utils/date';
import { compareByOrder, ORDER_STEP } from '@/domain/constants';

interface TaskState {
  tasks: Task[];
  loading: boolean;
  lastCreatedId: string | null;
  pendingUndo: { ids: string[]; label: string; deletedAt: number; snapshot: Task[] } | null;

  loadDate: (date: string) => Promise<void>;
  add: (date: string, content: string) => string | null;
  setContent: (id: string, content: string) => void;
  /** 改分组（四大板块 / 其他）。同步到今日页只认四大板块，这里不作限制 */
  setSection: (id: string, sectionId: TaskSectionKey) => void;
  toggleDone: (id: string) => void;
  move: (id: string, direction: -1 | 1) => void;
  remove: (id: string) => void;
  undo: () => void;
  dismissUndo: () => void;
  /** 继承昨日的未完成任务。date 由调用方传入（今日无任务时也要能继承） */
  inheritFromYesterday: (date: string) => Promise<{ created: number; skipped: number }>;
}

export const useTaskStore = create<TaskState>((set, get) => {
  const commit = (tasks: Task[], touched: string[], immediate: boolean) => {
    set({ tasks });
    persistTasks(tasks, touched, immediate);
  };

  const nextOrder = (list: Task[]) =>
    list.reduce((max, t) => Math.max(max, t.order), 0) + ORDER_STEP;

  return {
    tasks: [],
    loading: false,
    lastCreatedId: null,
    pendingUndo: null,

    async loadDate(date) {
      set({ loading: true });
      try {
        const tasks = await repos.tasks.listByDate(date);
        set({ tasks, loading: false });
      } catch {
        set({ tasks: [], loading: false });
      }
    },

    add(date, content) {
      const now = clock.now();
      const task: Task = {
        id: newTaskId(),
        date,
        content,
        // 默认落在「其他」：用户还没说它属于哪个板块，就先不当作任何板块的事。
        // 反过来（默认「工作」）会让一次同步凭空把新任务塞进工作板块。
        sectionId: OTHER_KEY,
        done: false,
        order: nextOrder(get().tasks),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        inheritedFrom: null,
      };
      commit([...get().tasks, task], [task.id], true);
      set({ lastCreatedId: task.id });
      return task.id;
    },

    setContent(id, content) {
      const now = clock.now();
      const tasks = get().tasks.map((t) => (t.id === id ? { ...t, content, updatedAt: now } : t));
      commit(tasks, [id], false);
    },

    setSection(id, sectionId) {
      const now = clock.now();
      const tasks = get().tasks.map((t) =>
        t.id === id ? { ...t, sectionId, updatedAt: now } : t,
      );
      commit(tasks, [id], true);
    },

    toggleDone(id) {
      const now = clock.now();
      const tasks = get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done, updatedAt: now } : t));
      commit(tasks, [id], true);
    },

    move(id, direction) {
      const all = get().tasks;
      const now = clock.now();
      /*
        只让「存活」的任务参与换位。软删的任务还留在数组里（撤销要能原样恢复），
        但它已经不在页面上 —— 让它占掉一次「下移一格」的位置，
        用户按一次按钮就会觉得少挪了一格、或者干脆没动。
      */
      const alive = all.filter((t) => t.deletedAt === null).sort(compareByOrder);
      const target = alive.find((t) => t.id === id);

      /*
        🔴 分组之后，换位必须**限制在同组内**。
        任务页是按五个分组分段渲染的，若仍按全局顺序换位，按一次「下移」可能让这一行
        跳到另一个分组里去 —— 在用户看来它不是「下移了一格」，而是「消失了又出现在别处」，
        比不动难解释得多。
      */
      if (!target) return;
      const sameGroup = alive.filter((t) => t.sectionId === target.sectionId);
      const index = sameGroup.findIndex((t) => t.id === id);
      const swapIndex = index + direction;
      if (index === -1 || swapIndex < 0 || swapIndex >= sameGroup.length) return;

      const moved = sameGroup[index];
      const swapped = sameGroup[swapIndex];
      if (!moved || !swapped) return;

      /*
        写回的是 **order 字段**，不动数组位置 —— 与板块树同一套约定：
        展示顺序由 `order` 派生（页面读出后按 order 排序），数组位置只是存放细节。
        这样「删除 → 撤销」也天然正确：软删只改 deletedAt、order 原封不动，
        撤销回来就还在它原来的名次上。

        组内换位用「交换两者的 order」而不是整组重排 —— 后者会连带改动没参与换位
        的那些任务的 order，写库范围无谓地扩大。
      */
      const tasks = all.map((t) => {
        if (t.id === moved.id) return { ...t, order: swapped.order, updatedAt: now };
        if (t.id === swapped.id) return { ...t, order: moved.order, updatedAt: now };
        return t;
      });
      commit(tasks, [moved.id, swapped.id], true);
    },

    remove(id) {
      const now = clock.now();
      const target = get().tasks.find((t) => t.id === id);
      if (!target) return;
      const snapshot = { ...target };
      // 软删只改 deletedAt（架构红线）：撤销快照已存原始对象，undo 会恢复全部字段
      const tasks = get().tasks.map((t) => (t.id === id ? { ...t, deletedAt: now } : t));
      commit(tasks, [id], true);
      set({
        pendingUndo: {
          ids: [id],
          label: undoLabel(target.content, 1),
          deletedAt: now,
          snapshot: [snapshot],
        },
      });
    },

    undo() {
      const pending = get().pendingUndo;
      if (!pending) return;
      const now = clock.now();
      const tasks = get().tasks.map((t) =>
        pending.ids.includes(t.id) ? { ...t, deletedAt: null, updatedAt: now } : t,
      );
      commit(tasks, pending.ids, true);
      set({ pendingUndo: null });
    },

    dismissUndo() {
      set({ pendingUndo: null });
    },

    async inheritFromYesterday(date) {
      const yesterday = shiftDateKey(date, -1);
      try {
        const yesterdayTasks = await repos.tasks.listByDate(yesterday);
        const { created, skipped } = inheritUnfinishedTasks(get().tasks, yesterdayTasks, date, clock);
        if (created.length === 0) return { created: 0, skipped };
        commit([...get().tasks, ...created], created.map((t) => t.id), true);
        set({ lastCreatedId: null });
        return { created: created.length, skipped };
      } catch {
        return { created: 0, skipped: 0 };
      }
    },
  };
});
