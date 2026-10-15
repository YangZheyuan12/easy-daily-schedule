import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP_ID,
  BACKUP_VERSION,
  buildBackupPayload,
  describeSummary,
  filterAlive,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupTables,
} from '../backupService';
import { makeItem, makeInspiration, makeSlot, makeTask } from './fixtures';

function emptyTables(): BackupTables {
  return {
    items: [],
    tasks: [],
    days: [],
    selfStatus: [],
    timeSlots: [],
    inspirations: [],
    images: [],
  };
}

describe('备份文件的构建与解析', () => {
  it('序列化后再解析能原样还原（往返一致）', () => {
    const tables = emptyTables();
    tables.items = [makeItem({ id: 'i1', title: '写周报' })];
    tables.tasks = [makeTask({ id: 't1', content: '跑步' })];
    tables.timeSlots = [makeSlot({ id: 's1', content: '晨读' })];
    tables.inspirations = [makeInspiration({ id: 'n1', content: '一个想法' })];

    const payload = buildBackupPayload(tables, 1_700_000_000_000);
    const text = serializeBackup(payload);

    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.app).toBe(BACKUP_APP_ID);
    expect(parsed.payload.version).toBe(BACKUP_VERSION);
    expect(parsed.payload.exportedAt).toBe(1_700_000_000_000);
    expect(parsed.payload.tables.items).toHaveLength(1);
    expect(parsed.payload.tables.items[0].title).toBe('写周报');
    expect(parsed.payload.tables.inspirations[0].content).toBe('一个想法');
  });

  it('拒绝不是 JSON 的内容', () => {
    const result = parseBackup('这不是 JSON');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('JSON');
  });

  it('拒绝别的应用导出的文件（app 标识不一致）', () => {
    const text = JSON.stringify({ app: 'some-other-app', version: 1, tables: emptyTables() });
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('本应用');
  });

  it('拒绝版本号缺失与「来自未来」的版本', () => {
    const noVersion = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, tables: emptyTables() }));
    expect(noVersion.ok).toBe(false);

    const future = parseBackup(
      JSON.stringify({ app: BACKUP_APP_ID, version: BACKUP_VERSION + 99, tables: emptyTables() }),
    );
    expect(future.ok).toBe(false);
    if (future.ok) return;
    expect(future.error).toContain('升级');
  });

  it('缺少数据段时报错，而不是写出一份空库', () => {
    const result = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, version: 1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('数据段');
  });

  it('某张表不是数组时报错', () => {
    const text = JSON.stringify({
      app: BACKUP_APP_ID,
      version: 1,
      tables: { ...emptyTables(), items: { not: 'an array' } },
    });
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('items');
  });

  it('老版本备份没有 images 字段时按空数组处理（向前兼容）', () => {
    const legacy = {
      app: BACKUP_APP_ID,
      version: 1,
      exportedAt: 123,
      tables: {
        items: [],
        tasks: [],
        days: [],
        selfStatus: [],
        timeSlots: [],
        inspirations: [],
      },
    };
    const result = parseBackup(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.tables.images).toEqual([]);
  });

  it('exportedAt 缺失时兜底为 0 而不是 NaN', () => {
    const result = parseBackup(
      JSON.stringify({ app: BACKUP_APP_ID, version: 1, tables: emptyTables() }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.exportedAt).toBe(0);
  });
});

describe('软删过滤', () => {
  it('只保留 deletedAt 为 null 的记录（软删记录不进备份）', () => {
    const rows = [
      makeItem({ id: 'a', deletedAt: null }),
      makeItem({ id: 'b', deletedAt: 12345 }),
      makeItem({ id: 'c', deletedAt: null }),
    ];
    expect(filterAlive(rows).map((row) => row.id)).toEqual(['a', 'c']);
  });
});

describe('摘要', () => {
  it('统计各表条数', () => {
    const tables = emptyTables();
    tables.items = [makeItem({ id: 'i1' }), makeItem({ id: 'i2' })];
    tables.tasks = [makeTask({ id: 't1' })];
    tables.images = [
      { id: 'g1', itemId: 'i1', createdAt: 1, dataUrl: 'data:image/png;base64,AAA' },
    ];
    const summary = summarizeBackup(buildBackupPayload(tables, 0));
    expect(summary.items).toBe(2);
    expect(summary.tasks).toBe(1);
    expect(summary.images).toBe(1);
    expect(summary.inspirations).toBe(0);
  });

  it('空备份给出「没有可备份的数据」而不是空字符串', () => {
    const summary = summarizeBackup(buildBackupPayload(emptyTables(), 0));
    expect(describeSummary(summary)).toBe('没有可备份的数据');
  });

  it('有数据时拼成一句可读的话', () => {
    const tables = emptyTables();
    tables.items = [makeItem({ id: 'i1' })];
    tables.inspirations = [makeInspiration({ id: 'n1' })];
    const summary = summarizeBackup(buildBackupPayload(tables, 0));
    expect(describeSummary(summary)).toBe('1 条条目、1 条灵感');
  });
});
