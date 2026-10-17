import { create } from 'zustand';
import type { ItemImage, TaskImage } from '@/domain/types';
import { clock, repos } from './bootstrap';
import {
  buildBackupPayload,
  serializeBackup,
  parseBackup,
  summarizeBackup,
  describeSummary,
  filterAlive,
  type BackupImage,
  type BackupTaskImage,
  type BackupTables,
} from '@/services/backupService';
import { saveTextFile, shareTextFile, pickTextFile } from '@/platform/fileBridge';
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
      const [
        itemsRaw,
        tasksRaw,
        days,
        selfStatus,
        slotsRaw,
        inspirationsRaw,
        imagesRaw,
        taskImagesRaw,
      ] = await Promise.all([
        repos.items.listAll(),
        repos.tasks.listAll(),
        repos.days.listAll(),
        repos.selfStatus.listAll(),
        repos.timeSlots.listAll(),
        repos.inspirations.listAll(),
        includeImages ? repos.itemImages.listAll() : Promise.resolve<ItemImage[]>([]),
        includeImages ? repos.taskImages.listAll() : Promise.resolve<TaskImage[]>([]),
      ]);

      const aliveTaskIds = new Set(
        tasksRaw.filter((task) => task.deletedAt === null).map((task) => task.id),
      );

      const tables: BackupTables = {
        items: filterAlive(itemsRaw),
        tasks: filterAlive(tasksRaw),
        days,
        selfStatus,
        timeSlots: filterAlive(slotsRaw),
        inspirations: filterAlive(inspirationsRaw),
        images: [],
        taskImages: [],
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

      // 任务图片同上口径：只带还活着的任务挂的图
      if (includeImages && taskImagesRaw.length > 0) {
        const converted: BackupTaskImage[] = [];
        for (const image of taskImagesRaw) {
          if (!aliveTaskIds.has(image.taskId)) continue;
          try {
            converted.push({
              id: image.id,
              taskId: image.taskId,
              createdAt: image.createdAt,
              dataUrl: await blobToDataUrl(image.blob),
            });
          } catch {
            // 同上：单张失败不影响整份
          }
        }
        tables.taskImages = converted;
      }

      const payload = buildBackupPayload(tables, clock.now());
      const text = serializeBackup(payload);
      const stamp = toDateKey(new Date(payload.exportedAt));
      const filename = `日程表备份-${stamp}.json`;

      /*
        两步是一次性交付，不是一个走了另一个就不走：
        ① 先把文件**长期留存**一份到系统「下载」目录（这是唯一的本地生命线）；
        ② 再弹系统分享面板，让用户当场就能发给微信 / QQ / 存进网盘。
        只发不存：分享窗口一关，这份文件就只剩聊天记录里的副本了；
        只存不发：用户又要在文件管理 App 里翻半天（2026-10-17 的原话是「找不到」）。
      */
      const saved = await saveTextFile(filename, text);
      const shared = await shareTextFile(filename, text);

      /*
        提示里的文件名必须是**真实**的那个（可能被 MediaStore 改名成「xxx (1).json」）——
        否则用户照着提示里的名字去找，手机里根本没这个文件。
      */
      const realName = saved.name || filename;
      const message = shared.shared
        ? `已导出 ${describeSummary(summarizeBackup(payload))}，可选择微信 / QQ / 网盘发送；原件已存到${saved.location}，文件名「${realName}」`
        : `已导出 ${describeSummary(summarizeBackup(payload))}，保存到${saved.location}，文件名「${realName}」`;
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

      // 任务图片（新版本备份才有；老备份这里自然是空数组）
      if (t.taskImages && t.taskImages.length > 0) {
        const restored: TaskImage[] = [];
        for (const image of t.taskImages) {
          const blob = dataUrlToBlob(image.dataUrl);
          if (!blob) continue;
          restored.push({
            id: image.id,
            taskId: image.taskId,
            blob,
            createdAt: image.createdAt,
          });
        }
        if (restored.length > 0) await repos.taskImages.putMany(restored);
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
  const [items, tasks, slots, inspirations, images, taskImages] = await Promise.all([
    repos.items.listAll(),
    repos.tasks.listAll(),
    repos.timeSlots.listAll(),
    repos.inspirations.listAll(),
    repos.itemImages.listAll(),
    repos.taskImages.listAll(),
  ]);

  await Promise.all([
    repos.items.hardDeleteMany(items.map((row) => row.id)),
    repos.tasks.hardDeleteMany(tasks.map((row) => row.id)),
    repos.timeSlots.hardDeleteMany(slots.map((row) => row.id)),
    repos.inspirations.hardDeleteMany(inspirations.map((row) => row.id)),
    repos.days.clearAll(),
    repos.selfStatus.clearAll(),
  ]);

  // 图片没有批量删除接口，逐张删（图片数量级远小于条目，可接受）
  for (const image of images) {
    await repos.itemImages.delete(image.id);
  }
  for (const image of taskImages) {
    await repos.taskImages.delete(image.id);
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
