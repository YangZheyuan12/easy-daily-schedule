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
  type BackupPayload,
  type BackupTaskImage,
  type BackupTables,
} from '@/services/backupService';
import {
  saveTextFile,
  shareTextFile,
  pickTextFile,
  writeNativeSnapshot,
  readNativeSnapshot,
  supportsNativeSnapshot,
} from '@/platform/fileBridge';
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
  /**
   * 本机是否能写「自救快照」。
   * 当前只有 iOS 为 true —— 只有它会回收 WKWebView 的站点数据（见 `platform/fileBridge.ts`）。
   */
  snapshotSupported: boolean;
  setIncludeImages: (value: boolean) => void;
  exportBackup: () => Promise<BackupResult>;
  /** 唤起文件选择器并读出文本；用户取消返回 null */
  pickBackupText: () => Promise<string | null>;
  importBackup: (text: string, mode: ImportMode) => Promise<BackupResult>;
  /** 静默把最新数据写一份到原生沙盒（不含图片）；失败不打扰用户 */
  writeSnapshot: () => Promise<void>;
  /** 用本机快照**覆盖**恢复（本地已空时才该用它） */
  restoreSnapshot: () => Promise<BackupResult>;
  /** 启动自检：本地库为空且有可用快照时返回一句提示文案，否则 null */
  checkSnapshotRecovery: () => Promise<string | null>;
  clearMessage: () => void;
}

export const useBackupStore = create<BackupState>((set, get) => ({
  busy: false,
  includeImages: false,
  lastMessage: '',
  snapshotSupported: supportsNativeSnapshot(),

  setIncludeImages: (value) => set({ includeImages: value }),
  clearMessage: () => set({ lastMessage: '' }),

  async exportBackup() {
    const includeImages = get().includeImages;
    set({ busy: true, lastMessage: '' });
    try {
      const payload = await collectBackupPayload(includeImages);
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

  /**
   * 静默写一份「自救快照」到原生沙盒。
   *
   * 触发时机是「切到后台」—— 那正是 iOS 可能回收 WKWebView 数据的时刻。
   * **不含图片**：这条路径的目的是「文字数据别丢」，base64 图片会让体积膨胀 1/3，
   * 而且写得太重就不再是「顺手兜底」了（要图片请走导出）。
   * 所有失败都吞掉：兜底动作失败不该变成用户面前的报错。
   */
  async writeSnapshot() {
    if (!get().snapshotSupported) return;
    try {
      const payload = await collectBackupPayload(false);
      await writeNativeSnapshot(serializeBackup(payload));
    } catch {
      // 静默：快照只是兜底，写成功与否都不影响正常使用
    }
  },

  /**
   * 用本机快照恢复 —— **覆盖**语义。
   *
   * 为什么是覆盖而不是合并：能走到这一步的前提是本地库已经空了（WebView 数据被回收），
   * 此时没有任何东西需要保留；合并只会把「恢复」变成「又混进半份旧数据」。
   */
  async restoreSnapshot() {
    const text = await readNativeSnapshot();
    if (!text) return { ok: false, message: '本机没有可恢复的快照' };
    return get().importBackup(text, 'overwrite');
  },

  /**
   * 启动自检：**本地库为空**且本机有可用快照时，返回一句提示。
   *
   * 为什么只在库空时提示：正常使用中每次切后台都会刷新快照，若每次都弹提示就成了骚扰。
   * 库空才是真正的「出事了」—— 那正是数据被回收之后的形态。
   */
  async checkSnapshotRecovery() {
    if (!get().snapshotSupported) return null;
    try {
      const text = await readNativeSnapshot();
      if (!text) return null;
      const parsed = parseBackup(text);
      if (!parsed.ok) return null;
      if (!(await isLibraryEmpty())) return null;
      return `检测到本机快照（${describeSummary(summarizeBackup(parsed.payload))}），可在「我的 → 数据备份」恢复`;
    } catch {
      return null;
    }
  },
}));

/**
 * 组装一份备份负载 —— 导出与后台快照**共用这一份口径**。
 *
 * 🔴 不要在两处各写一遍取数逻辑：那样很快会出现「导出的文件有八张表、
 * 后台快照只剩五张」的漂移，而漂移往往只会在真正需要恢复的那天才被发现。
 */
async function collectBackupPayload(includeImages: boolean): Promise<BackupPayload> {
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

  return buildBackupPayload(tables, clock.now());
}

/**
 * 本地库是否「没有内容」。
 *
 * 只看用户真正生产的数据（条目 / 任务 / 时间段 / 灵感）。`days` 与 `selfStatus`
 * 会因为「打开过某一天」自动产生记录，拿它们判断会把空库误判成有数据，
 * 于是该提示恢复的时候反而沉默。
 */
async function isLibraryEmpty(): Promise<boolean> {
  const [items, tasks, slots, inspirations] = await Promise.all([
    repos.items.listAll(),
    repos.tasks.listAll(),
    repos.timeSlots.listAll(),
    repos.inspirations.listAll(),
  ]);

  return (
    filterAlive(items).length === 0 &&
    filterAlive(tasks).length === 0 &&
    filterAlive(slots).length === 0 &&
    filterAlive(inspirations).length === 0
  );
}

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
