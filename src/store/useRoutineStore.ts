import { create } from 'zustand';
import type { Routine, RoutineCompletion } from '@/domain/types';
import type { TaskSectionKey } from '@/domain/enums';
import { OTHER_KEY } from '@/domain/enums';
import { clock, persistence, repos } from './bootstrap';
import { persistRoutines, persistRoutineCompletion } from './helper';
import { newId } from '@/services/idService';
import { undoLabel } from '@/services/undoService';
import { routineCompletionKey, computeRoutineProgress } from '@/services/routineService';
import { compareByOrder, ORDER_STEP } from '@/domain/constants';

interface RoutineState {
  /**
   * 全部存活模板（按 order 升序）。
   * 模板是跨日期复用的，因此与 `date` 无关 —— 但完成态是每天的，
   * 具体某天的勾选由 `completions` 按 routineId + date 表达。
   */
  routines: Routine[];
  /** 当前加载日期的全部完成记录，以 `${routineId}@${date}` 为键 */
  completions: Record<string, RoutineCompletion>;
  loading: boolean;
  lastCreatedId: string | null;
  pendingUndo: { ids: string[]; label: string; deletedAt: number; snapshot: Routine[] } | null;

  /** 加载某天的模板 + 完成记录（由 AppShell 在切日期时统一触发） */
  loadDate: (date: string) => Promise<void>;
  /** 新增模板（标题为空也允许，创建后聚焦该行让用户填写）。始终返回新建的 id */
  add: (title: string, sectionId?: TaskSectionKey) => string;
  setTitle: (id: string, title: string) => void;
  setSection: (id: string, sectionId: TaskSectionKey) => void;
  setDescription: (id: string, description: string) => void;
  /** 拖拽排序：按传入的 id 序列重写 order（与任务页同套坐标系） */
  reorderIds: (ids: string[]) => void;
  /** 软删模板，并级联删除其全部每日完成记录 */
  remove: (id: string) => void;
  undo: () => void;
  dismissUndo: () => void;
  /** 某模板在某天是否已勾选完成 */
  isDone: (routineId: string, date: string) => boolean;
  /** 切换某模板在某天的完成态（每天独立） */
  toggleDone: (routineId: string, date: string) => void;
}

export const useRoutineStore = create<RoutineState>((set, get) => {
  const commit = (routines: Routine[], touched: string[], immediate: boolean) => {
    set({ routines: [...routines].sort(compareByOrder) });
    persistRoutines(routines, touched, immediate);
  };

  const nextOrder = (list: Routine[]) =>
    list.reduce((max, r) => Math.max(max, r.order), 0) + ORDER_STEP;

  return {
    routines: [],
    completions: {},
    loading: false,
    lastCreatedId: null,
    pendingUndo: null,

    async loadDate(date) {
      set({ loading: true });
      try {
        const [routines, comps] = await Promise.all([
          repos.routines.listAlive(),
          repos.routineCompletions.listByDate(date),
        ]);
        const completions: Record<string, RoutineCompletion> = {};
        for (const c of comps) completions[c.id] = c;
        set({ routines, completions, loading: false });
      } catch {
        set({ routines: [], completions: {}, loading: false });
      }
    },

    add(title, sectionId = OTHER_KEY) {
      const now = clock.now();
      const routine: Routine = {
        id: newId('rt'),
        title,
        // 默认落在「其他」：与任务同约定，没说属于哪块就先不归类
        sectionId,
        order: nextOrder(get().routines),
        description: '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      commit([...get().routines, routine], [routine.id], true);
      set({ lastCreatedId: routine.id });
      return routine.id;
    },

    setTitle(id, title) {
      const now = clock.now();
      const routines = get().routines.map((r) =>
        r.id === id ? { ...r, title, updatedAt: now } : r,
      );
      // 标题是连续输入，走防抖（不立即落盘）
      commit(routines, [id], false);
    },

    setSection(id, sectionId) {
      const now = clock.now();
      const routines = get().routines.map((r) =>
        r.id === id ? { ...r, sectionId, updatedAt: now } : r,
      );
      commit(routines, [id], true);
    },

    setDescription(id, description) {
      const now = clock.now();
      const routines = get().routines.map((r) =>
        r.id === id ? { ...r, description, updatedAt: now } : r,
      );
      commit(routines, [id], false);
    },

    reorderIds(ids) {
      if (ids.length < 2) return;
      const now = clock.now();
      const orderById = new Map(ids.map((id, i) => [id, (i + 1) * ORDER_STEP]));
      const routines = get().routines.map((r) => {
        const order = orderById.get(r.id);
        return order === undefined || order === r.order ? r : { ...r, order, updatedAt: now };
      });
      commit(routines, ids, true);
    },

    remove(id) {
      const now = clock.now();
      const target = get().routines.find((r) => r.id === id);
      if (!target) return;
      const snapshot = { ...target };

      // 软删只改 deletedAt（架构红线）：撤销能完整恢复
      const routines = get().routines.filter((r) => r.id !== id);

      // 级联：删除该模板的全部每日完成记录（完成态是模板的附属，模板没了就没意义）
      const compKeys = Object.keys(get().completions).filter(
        (key) => get().completions[key].routineId === id,
      );
      const completions = { ...get().completions };
      for (const key of compKeys) delete completions[key];

      set({
        routines,
        completions,
        pendingUndo: {
          ids: [id],
          label: undoLabel(target.title || '固定任务', 1),
          deletedAt: now,
          snapshot: [snapshot],
        },
      });

      // 落盘：模板软删 + 完成记录物理删除
      persistRoutines([{ ...target, deletedAt: now }], [id], true);
      if (compKeys.length > 0) void persistence.hardDeleteRoutineCompletions(compKeys);
    },

    undo() {
      const pending = get().pendingUndo;
      if (!pending) return;
      const now = clock.now();
      const restored = pending.snapshot.map((r) => ({ ...r, deletedAt: null, updatedAt: now }));
      commit([...get().routines, ...restored], pending.ids, true);
      set({ pendingUndo: null });
    },

    dismissUndo() {
      set({ pendingUndo: null });
    },

    isDone(routineId, date) {
      return get().completions[routineCompletionKey(routineId, date)]?.done ?? false;
    },

    toggleDone(routineId, date) {
      const now = clock.now();
      const key = routineCompletionKey(routineId, date);
      const prev = get().completions[key];
      const done = !(prev?.done ?? false);
      const next: RoutineCompletion = prev
        ? { ...prev, done, updatedAt: now }
        : { id: key, routineId, date, done, updatedAt: now };
      set({ completions: { ...get().completions, [key]: next } });
      // 勾选是离散操作，立即落盘
      persistRoutineCompletion(next, true);
    },
  };
});

/** 导出供组件直接计算完成度（避免在多处重复派生） */
export { computeRoutineProgress };
