import { create } from 'zustand';
import type { ItemImage } from '@/domain/types';
import { clock, repos } from './bootstrap';
import { newId } from '@/services/idService';

/** 稳定空数组，避免 selector 返回新引用触发无谓重渲染 */
const EMPTY: ItemImage[] = [];

export interface ItemImageState {
  /** itemId → 该条目挂的图片（按 createdAt 升序） */
  byItem: Record<string, ItemImage[]>;
  /** 最近一次加载所依据的批次标识（这里用日期键），避免重复拉取 */
  loadedKey: string;

  /**
   * 加载若干条目的图片，覆盖式写入 `byItem`。
   * `key` 用于去重：同一日期重复调用不会再次查询；切到别的日期（key 变了）才重新拉。
   */
  loadForItems: (itemIds: string[], key: string) => Promise<void>;
  /** 给某条目新增若干图片（自动过滤非图片文件），乐观更新本地后落库 */
  add: (itemId: string, files: File[]) => Promise<void>;
  /** 删除单张图片（本地 + 落库） */
  remove: (imageId: string, itemId: string) => Promise<void>;
}

export const useItemImageStore = create<ItemImageState>((set, get) => ({
  byItem: {},
  loadedKey: '',

  async loadForItems(itemIds, key) {
    if (key !== '' && key === get().loadedKey) return;
    try {
      const grouped: Record<string, ItemImage[]> = {};
      if (itemIds.length > 0) {
        const rows = await repos.itemImages.listByItemIds(itemIds);
        for (const row of rows) {
          (grouped[row.itemId] ??= []).push(row);
        }
      }
      set({ byItem: grouped, loadedKey: key });
    } catch {
      // 读图失败不应阻塞今日列表（图片是增强项）；保留已有的 byItem 即可
      set({ loadedKey: key });
    }
  },

  async add(itemId, files) {
    const now = clock.now();
    const created: ItemImage[] = files
      .filter((file) => file.type.startsWith('image/'))
      .map((file) => ({ id: newId('img'), itemId, blob: file, createdAt: now }));
    if (created.length === 0) return;
    await repos.itemImages.putMany(created);
    const prev = get().byItem[itemId] ?? [];
    const merged = [...prev, ...created].sort((a, b) => a.createdAt - b.createdAt);
    set({ byItem: { ...get().byItem, [itemId]: merged } });
  },

  async remove(imageId, itemId) {
    await repos.itemImages.delete(imageId);
    const prev = get().byItem[itemId] ?? [];
    set({
      byItem: { ...get().byItem, [itemId]: prev.filter((image) => image.id !== imageId) },
    });
  },
}));

/** 取某条目图片；无则稳定返回空数组 */
export function selectImagesOf(itemId: string): (s: ItemImageState) => ItemImage[] {
  return (s) => s.byItem[itemId] ?? EMPTY;
}

export { EMPTY as EMPTY_IMAGES };
