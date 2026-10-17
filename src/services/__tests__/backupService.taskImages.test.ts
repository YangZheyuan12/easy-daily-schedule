import { describe, expect, it } from 'vitest';
import { describeSummary, parseBackup, summarizeBackup } from '@/services/backupService';
import { BACKUP_APP_ID, BACKUP_VERSION } from '@/services/backupService';

/**
 * 任务图片进备份（2026-10-17 第十轮）。
 *
 * 任务图片是新加的字段，必须与旧的备份文件**双向兼容**：
 * - 老备份（没有 taskImages）能导进来 —— 缺省按空数组，不能报错；
 * - 新备份能被老版本 App 读（多一个未知字段不影响），这里只保证结构可选。
 *
 * 钉这条契约的原因很实际：备份是本项目唯一的数据找回手段，
 * 「多一个新字段」把老备份挡在了门外是典型的致命升级。
 */
const payload = (tables: Record<string, unknown>, exportedAt = 1700000000000) => ({
  app: BACKUP_APP_ID,
  version: BACKUP_VERSION,
  exportedAt,
  tables,
});

describe('备份里的任务图片', () => {
  it('带 taskImages 的备份能被解析出来', () => {
    const text = JSON.stringify(
      payload({
        items: [],
        tasks: [{ id: 't1' }],
        days: [],
        selfStatus: [],
        timeSlots: [],
        inspirations: [],
        images: [],
        taskImages: [{ id: 'ti1', taskId: 't1', createdAt: 1, dataUrl: 'data:image/png;base64,AA' }],
      }),
    );

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.tables.taskImages).toHaveLength(1);
    expect(parsed.payload.tables.taskImages?.[0]?.taskId).toBe('t1');
  });

  it('老备份没有 taskImages：按空数组兜底，不报错', () => {
    const text = JSON.stringify(
      payload({
        items: [],
        tasks: [],
        days: [],
        selfStatus: [],
        timeSlots: [],
        inspirations: [],
        images: [],
      }),
    );

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.tables.taskImages).toEqual([]);
  });

  it('摘要把条目图片与任务图片合成一个「N 张图片」', () => {
    const text = JSON.stringify(
      payload({
        items: [],
        tasks: [],
        days: [],
        selfStatus: [],
        timeSlots: [],
        inspirations: [],
        images: [{ id: 'i1', itemId: 'x', createdAt: 1, dataUrl: 'data:,' }],
        taskImages: [
          { id: 't1', taskId: 'y', createdAt: 1, dataUrl: 'data:,' },
          { id: 't2', taskId: 'y', createdAt: 2, dataUrl: 'data:,' },
        ],
      }),
    );

    const parsed = parseBackup(text);
    if (!parsed.ok) throw new Error('应当解析成功');
    const summary = summarizeBackup(parsed.payload);
    expect(summary.images).toBe(1);
    expect(summary.taskImages).toBe(2);
    expect(describeSummary(summary)).toContain('3 张图片');
  });

  it('taskImages 不是数组 → 拒绝（与其它表同一口径）', () => {
    const text = JSON.stringify(
      payload({
        items: [],
        tasks: [],
        days: [],
        selfStatus: [],
        timeSlots: [],
        inspirations: [],
        images: [],
        taskImages: { not: 'an array' },
      }),
    );

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain('taskImages');
  });
});
