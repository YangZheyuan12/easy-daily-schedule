import type {
  DailySelfStatus,
  Day,
  Inspiration,
  Item,
  Task,
  TimeSlot,
} from '@/domain/types';

/**
 * 备份文件的构建与解析（纯函数，零浏览器 API）。
 *
 * 之所以做成纯函数：`src/services/` 是迁微信小程序时要 100% 复用的内核，
 * 一旦在这里碰到 Blob / FileReader / URL 就废了。所以本文件只负责
 * 「数据结构 ↔ JSON 字符串」，文件落地（下载 / 选择）与图片的 base64 编解码
 * 都放在 `src/platform/`。
 *
 * 设计取舍：
 * - **软删记录不导出**。备份的意义是「用户看得见的数据」，把 7 天撤销窗口里
 *   那些已删条目也带出去，恢复时会复活一堆用户以为早就没了的东西。
 * - **图片默认不带**。图片是 Blob，转 base64 后体积会膨胀约 1/3，
 *   一张 3MB 的照片就能让备份文件难以分享。故图片是**可选**的独立字段，
 *   没有图片时 `images` 就是空数组。
 * - **按 id 幂等**。导入走 upsert（同 id 覆盖），重复导入同一份文件不会翻倍。
 */

export const BACKUP_VERSION = 1;
/** 文件头标识：用来快速判断「这是不是本应用导出的备份」 */
export const BACKUP_APP_ID = 'daily-schedule';

/** 备份文件里的图片附件（Blob 在 JSON 里只能是 base64） */
export interface BackupImage {
  id: string;
  itemId: string;
  createdAt: number;
  /** 形如 `data:image/png;base64,....` 的 data URL */
  dataUrl: string;
}

/** 任务图片（与 BackupImage 分开，因为归属键不同） */
export interface BackupTaskImage {
  id: string;
  taskId: string;
  createdAt: number;
  dataUrl: string;
}

export interface BackupTables {
  items: Item[];
  tasks: Task[];
  days: Day[];
  selfStatus: DailySelfStatus[];
  timeSlots: TimeSlot[];
  inspirations: Inspiration[];
  /** 可选：未勾选「含图片」时为空数组 */
  images: BackupImage[];
  /**
   * 可选：任务图片。**后加的字段**（旧版本备份里没有）——所以这里必须是可选的，
   * 解析时缺了按空数组兜底，老备份照样能导进来。
   */
  taskImages?: BackupTaskImage[];
}

export interface BackupPayload {
  app: string;
  version: number;
  exportedAt: number;
  tables: BackupTables;
}

export interface BackupSummary {
  items: number;
  tasks: number;
  timeSlots: number;
  inspirations: number;
  days: number;
  selfStatus: number;
  images: number;
  /** 任务图片张数（条目图片之外的另一张表） */
  taskImages: number;
}

export type ParseResult =
  | { ok: true; payload: BackupPayload }
  | { ok: false; error: string };

/** 软删过滤：只导出「用户看得见」的记录 */
export function filterAlive<T extends { deletedAt: number | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.deletedAt === null);
}

export function buildBackupPayload(
  tables: BackupTables,
  now: number,
): BackupPayload {
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: now,
    tables,
  };
}

export function serializeBackup(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function summarizeBackup(payload: BackupPayload): BackupSummary {
  const t = payload.tables;
  return {
    items: t.items.length,
    tasks: t.tasks.length,
    timeSlots: t.timeSlots.length,
    inspirations: t.inspirations.length,
    days: t.days.length,
    selfStatus: t.selfStatus.length,
    images: t.images.length,
    taskImages: t.taskImages?.length ?? 0,
  };
}

/** 把摘要写成一句给 toast 用的话 */
export function describeSummary(summary: BackupSummary): string {
  const parts: string[] = [];
  if (summary.items > 0) parts.push(`${summary.items} 条条目`);
  if (summary.tasks > 0) parts.push(`${summary.tasks} 条任务`);
  if (summary.timeSlots > 0) parts.push(`${summary.timeSlots} 个时间段`);
  if (summary.inspirations > 0) parts.push(`${summary.inspirations} 条灵感`);
  if (summary.images + summary.taskImages > 0) {
    parts.push(`${summary.images + summary.taskImages} 张图片`);
  }
  if (parts.length === 0) return '没有可备份的数据';
  return parts.join('、');
}

/**
 * 解析并校验备份文件。
 *
 * 校验是必要的：手工改坏的 / 别的应用导出的 JSON 如果直接写库，
 * 会把整份数据搞成半残状态，而且没有任何撤销路径。
 */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: '备份文件格式不正确' };
  }

  const payload = raw as Partial<BackupPayload>;
  if (payload.app !== BACKUP_APP_ID) {
    return { ok: false, error: '这不是本应用导出的备份文件' };
  }
  if (typeof payload.version !== 'number' || payload.version < 1) {
    return { ok: false, error: '备份文件缺少版本号' };
  }
  if (payload.version > BACKUP_VERSION) {
    return {
      ok: false,
      error: `备份文件版本（v${payload.version}）比当前应用更新，请先升级应用`,
    };
  }

  const tables = payload.tables as Partial<BackupTables> | undefined;
  if (typeof tables !== 'object' || tables === null) {
    return { ok: false, error: '备份文件缺少数据段' };
  }

  // 每张表都必须是数组；缺省的表按空数组处理（老版本备份可能没有 images / taskImages）
  const names: (keyof BackupTables)[] = [
    'items',
    'tasks',
    'days',
    'selfStatus',
    'timeSlots',
    'inspirations',
    'images',
    'taskImages',
  ];
  for (const name of names) {
    const value = tables[name];
    if (value !== undefined && !Array.isArray(value)) {
      return { ok: false, error: `数据段 ${name} 格式不正确` };
    }
  }

  const normalized: BackupTables = {
    items: Array.isArray(tables.items) ? tables.items : [],
    tasks: Array.isArray(tables.tasks) ? tables.tasks : [],
    days: Array.isArray(tables.days) ? tables.days : [],
    selfStatus: Array.isArray(tables.selfStatus) ? tables.selfStatus : [],
    timeSlots: Array.isArray(tables.timeSlots) ? tables.timeSlots : [],
    inspirations: Array.isArray(tables.inspirations) ? tables.inspirations : [],
    images: Array.isArray(tables.images) ? tables.images : [],
    taskImages: Array.isArray(tables.taskImages) ? tables.taskImages : [],
  };

  // exportedAt 缺失时兜底为 0，不影响导入（只是摘要里显示不出来）
  return {
    ok: true,
    payload: {
      app: BACKUP_APP_ID,
      version: payload.version,
      exportedAt: typeof payload.exportedAt === 'number' ? payload.exportedAt : 0,
      tables: normalized,
    },
  };
}

/**
 * 导入时两张表怎么并：同主键以 `incoming` 为准。
 *
 * 实际写库走仓储的 `upsertMany`（bulkPut 本身就是「同主键覆盖、其余不动」），
 * 所以这里不需要真的去做合并计算；保留这个语义说明，是为了让「合并」与
 * 「覆盖」的区别只体现在**是否先清表**，而不是两套写入逻辑。
 */
