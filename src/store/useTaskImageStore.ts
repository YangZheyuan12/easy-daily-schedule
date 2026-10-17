import { create } from 'zustand';
import type { TaskImage } from '@/domain/types';
import { clock, repos } from './bootstrap';
import { newId } from '@/services/idService';

/** 稳定空数组，避免 selector 返回新引用触发无谓重渲染 */
const EMPTY: TaskImage[] = [];

export interface TaskImageState {
  /** taskId → 该任务挂的图片（按 createdAt 升序） */
  byTask: Record<string, TaskImage[]>;
  /** 最近一次加载所依据的批次标识（这里用「k 个任务 id 拼出来的 key」） */
  loadedKey: string;

  /**
   * 批量加载若干任务的图片，覆盖式写入 `byTask`。
   * `key` 用于去重：同一批任务重复调用不会再次查询。
   */
  loadForTasks: (taskIds: string[], key: string) => Promise<void>;
  /** 加载单个任务的图片（抽屉打开某一条时用它，key 就用 taskId） */
  loadOne: (taskId: string) => Promise<void>;
  /** 给某任务新增若干图片（自动过滤非图片文件），乐观更新本地后落库 */
  add: (taskId: string, files: File[]) => Promise<void>;
  /** 删除单张图片（本地 + 落库） */
  remove: (imageId: string, taskId: string) => Promise<void>;
}

export const useTaskImageStore = create<TaskImageState>((set, get) => ({
  byTask: {},
  loadedKey: '',

  async loadForTasks(taskIds, key) {
    if (key !== '' && key === get().loadedKey) return;
    try {
      const grouped: Record<string, TaskImage[]> = {};
      if (taskIds.length > 0) {
        const rows = await repos.taskImages.listByTaskIds(taskIds);
        for (const row of rows) {
          (grouped[row.taskId] ??= []).push(row);
        }
      }
      set({ byTask: grouped, loadedKey: key });
    } catch {
      // 读图失败不该挡住列表渲染（图片是增强项）；保留已有的 byTask 即可
      set({ loadedKey: key });
    }
  },

  async loadOne(taskId) {
    try {
      const rows = await repos.taskImages.listByTaskIds([taskId]);
      set({ byTask: { ...get().byTask, [taskId]: rows } });
    } catch {
      // 同上：失败时保留旧值
    }
  },

  async add(taskId, files) {
    const now = clock.now();
    const created: TaskImage[] = files
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ id: newId('timg'), taskId, blob: file, createdAt: now }));
    if (created.length === 0) return;
    await repos.taskImages.putMany(created);
    const prev = get().byTask[taskId] ?? [];
    const merged = [...prev, ...created].sort((a, b) => a.createdAt - b.createdAt);
    set({ byTask: { ...get().byTask, [taskId]: merged } });
  },

  async remove(imageId, taskId) {
    await repos.taskImages.delete(imageId);
    const prev = get().byTask[taskId] ?? [];
    set({ byTask: { ...get().byTask, [taskId]: prev.filter((image) => image.id !== imageId) } });
  },
}));

/** 取某任务的图片；无则稳定返回空数组 */
export function selectTaskImages(taskId: string): (s: TaskImageState) => TaskImage[] {
  return (s) => s.byTask[taskId] ?? EMPTY;
}

export { EMPTY as EMPTY_TASK_IMAGES };
