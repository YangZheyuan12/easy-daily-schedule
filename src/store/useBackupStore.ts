import { create } from 'zustand';
import type { ItemImage } from '@/domain/types';
import { clock, repos } from './bootstrap';
import {
  buildBackupPayload,
  serializeBackup,
  parseBackup,
  summarizeBackup,
  describeSummary,
  filterAlive,
  type BackupImage,
  type BackupTables,
} from '@/services/backupService';
import { saveTextFile, pickTextFile } from '@/platform/fileBridge';
import { blobToDataUrl, dataUrlToBlob } from '@/platform/imageCodec';
import { useItemStore } from './useItemStore';
import { useTaskStore } from './useTaskStore';
import { useTimeSlotStore } from './useTimeSlotStore';
import { useInspirationStore } from './useInspirationStore';
import { useDayStore } from './useDayStore';
import { toDateKey } from '@/utils/date';

/**
 * 备份的导出 / 导入编排。
 *
 * 这里是唯一同时认识「仓储」与「文件」的地方：纯数据逻辑在
 * `services/backupService.ts`，落地在 `platform/fileBridge.ts`，
 * 本文件只负责把它们串起来，并在结束后让内存里的 store 重新读一次库。
 *
 * 两种导入语义：
 * - **合并**（默认）：按主键 upsert，同 id 覆盖、其余保留。重复导同一份文件不会翻倍。
 * - **覆盖**：先清空当前全部数据再写入。用于「回到某个时间点的状态」；
 *   注意它会把备份里没有、但现在存在的数据一并抹掉。
 */

export type ImportMode = 'merge' | 'overwrite';

export interface BackupResult {
  ok: boolean;
  message: string;
}

interface BackupState {
  busy: boolean;
  /** 导出时是否连同图片一起（图片会让文件明显变大） */
  includeImages: boolean;
  lastMessage: string;
  setIncludeImages: (value: boolean) => void;
  exportBackup: () => Promise<BackupResult>;
  /** 唤起文件选择器并读出文本；用户取消返回 null */
  pickBackupText: () => Promise<string | null>;
  importBackup: (text: string, mode: ImportMode) => Promise<BackupResult>;
  clearMessage: () => void;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  busy: false,
  includeImages: false,
  lastMessage: '',

  setIncludeImages: (value) => set({ includeImages: value }),
  clearMessage: () => set({ lastMessage: '' }),

  async exportBackup() {
    const includeImages = get().includeImages;
    set({ busy: true, lastMessage: '' });
    try {
      const [itemsRaw, tasksRaw, days, selfStatus, slotsRaw, inspirationsRaw, imagesRaw] =
        await Promise.all([
          repos.items.listAll(),
          repos.tasks.listAll(),
          repos.days.listAll(),
          repos.selfStatus.listAll(),
          repos.timeSlots.listAll(),
          repos.inspirations.listAll(),
          includeImages ? repos.itemImages.listAll() : Promise.resolve<ItemImage[]>([]),
        ]);

      const tables: BackupTables = {
        items: filterAlive(itemsRaw),
        tasks: filterAlive(tasksRaw),
        days,
        selfStatus,
        timeSlots: filterAlive(slotsRaw),
        inspirations: filterAlive(inspirationsRaw),
        images: [],
      };

      // 图片：只带「仍然活着的条目」挂着的附件，避免把已删条目的图也背出去
      if (includeImages && imagesRaw.length > 0) {
        const aliveIds = new Set(tables.items.map((item) => item.id));
        const converted: BackupImage[] = [];
        for (const image of imagesRaw) {
          if (!aliveIds.has(image.itemId)) continue;
          try {
            converted.push({
              id: image.id,
              itemId: image.itemId,
              createdAt: image.createdAt,
              dataUrl: await blobToDataUrl(image.blob),
            });
          } catch {
            // 单张转换失败就跳过，不让一张坏图毁掉整份备份
          }
        }
        tables.images = converted;
      }

      const payload = buildBackupPayload(tables, clock.now());
      const text = serializeBackup(payload);
      const stamp = toDateKey(new Date(payload.exportedAt));
      // 落点描述（系统下载目录 / 浏览器下载目录）来自 fileBridge，原样进提示：
      // 用户抱怨过「不知道导出到哪去了、导入时找不到」（2026-10-16）。
      const location = await saveTextFile(`日程表备份-${stamp}.json`, text);

      const message = `已导出 ${describeSummary(summarizeBackup(payload))}，保存到${location}，文件名「日程表备份-${stamp}.json」`;
      set({ busy: false, lastMessage: message });
      return { ok: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败';
      set({ busy: false, lastMessage: `导出失败：${message}` });
      return { ok: false, message: `导出失败：${message}` };
    }
  },

  async pickBackupText() {
    return pickTextFile();
  },

  async importBackup(text, mode) {
    set({ busy: true, lastMessage: '' });
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      set({ busy: false, lastMessage: parsed.error });
      return { ok: false, message: parsed.error };
    }

    const t = parsed.payload.tables;
    try {
      if (mode === 'overwrite') {
        await clearEverything();
      }

      await Promise.all([
        repos.items.upsertMany(t.items),
        repos.tasks.upsertMany(t.tasks),
        repos.days.upsertMany(t.days),
        repos.selfStatus.upsertMany(t.selfStatus),
        repos.timeSlots.upsertMany(t.timeSlots),
        repos.inspirations.upsertMany(t.inspirations),
      ]);

      // 图片：base64 还原成 Blob；坏数据跳过而不是整份失败
      if (t.images.length > 0) {
        const restored: ItemImage[] = [];
        for (const image of t.images) {
          const blob = dataUrlToBlob(image.dataUrl);
          if (!blob) continue;
          restored.push({
            id: image.id,
            itemId: image.itemId,
            blob,
            createdAt: image.createdAt,
          });
        }
        if (restored.length > 0) await repos.itemImages.putMany(restored);
      }

      // 内存里的 store 重新读一次库，否则界面还停留在导入前的状态
      await refreshStores();

      const message = `已导入 ${describeSummary(summarizeBackup(parsed.payload))}`;
      set({ busy: false, lastMessage: message });
      return { ok: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入失败';
      set({ busy: false, lastMessage: `导入失败：${message}` });
      return { ok: false, message: `导入失败：${message}` };
    }
  },
}));

/** 覆盖导入：把当前库清干净（含软删记录，它们本来也不该留在「回到某时刻」的结果里） */
async function clearEverything(): Promise<void> {
  const [items, tasks, slots, inspirations, images] = await Promise.all([
    repos.items.listAll(),
    repos.tasks.listAll(),
    repos.timeSlots.listAll(),
    repos.inspirations.listAll(),
    repos.itemImages.listAll(),
  ]);

  await Promise.all([
    repos.items.hardDeleteMany(items.map((row) => row.id)),
    repos.tasks.hardDeleteMany(tasks.map((row) => row.id)),
    repos.timeSlots.hardDeleteMany(slots.map((row) => row.id)),
    repos.inspirations.hardDeleteMany(inspirations.map((row) => row.id)),
    repos.days.clearAll(),
    repos.selfStatus.clearAll(),
  ]);

  // itemImages 没有批量删除接口，逐张删（图片数量级远小于条目，可接受）
  for (const image of images) {
    await repos.itemImages.delete(image.id);
  }
}

/** 让各 store 按当前日期重新拉一次，界面立刻反映导入结果 */
async function refreshStores(): Promise<void> {
  const date = useDayStore.getState().date;
  await Promise.all([
    useItemStore.getState().loadDate(date),
    useTaskStore.getState().loadDate(date),
    useTimeSlotStore.getState().loadDate(date),
    useInspirationStore.getState().loadDate(date),
  ]);
}
