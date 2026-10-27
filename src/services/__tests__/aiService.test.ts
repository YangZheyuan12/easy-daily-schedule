import { describe, it, expect } from 'vitest';
import { AiService } from '@/services/aiService';
import type { AiGateway, AiKeyStore, Repositories } from '@/domain/ports';
import type { AiProviderConfig } from '@/domain/types';
import type { Clock } from '@/services/clock';

/**
 * buildSnapshot 聚合逻辑单测（纯逻辑，用假仓储，无网络 / 无 IndexedDB）。
 */
function buildService(overrides: {
  items?: unknown[];
  tasks?: unknown[];
  statuses?: unknown[];
}) {
  const fakeRepos = {
    items: { listByDateRange: async () => overrides.items ?? [] },
    tasks: { listByDateRange: async () => overrides.tasks ?? [] },
    selfStatus: { listBetween: async () => overrides.statuses ?? [] },
    settings: { get: async () => null, set: async () => undefined },
    aiAnalyses: { put: async () => undefined, listRecent: async () => [], get: async () => undefined },
  } as unknown as Repositories;

  const keyStore: AiKeyStore = {
    save: async () => undefined,
    load: async () => null,
    clear: async () => undefined,
  };
  const clock: Clock = { now: () => 0 };
  const createGateway = (_c: AiProviderConfig): AiGateway => ({
    analyze: async () => ({
      summary: '',
      completionRate: 0,
      insights: [],
      model: 'test',
      generatedAt: 0,
    }),
    chat: async () => '好的',
    testConnection: async () => undefined,
    listModels: async () => ['model-a', 'model-b'],
  });

  return new AiService(fakeRepos, keyStore, clock, createGateway);
}

describe('AiService.buildSnapshot', () => {
  it('按日期范围聚合每日完成率与整体统计', async () => {
    const service = buildService({
      items: [
        // 10-01：顶层 2 条，完成 1 条
        { date: '2026-10-01', sectionId: 'work', parentId: null, done: true, deletedAt: null },
        { date: '2026-10-01', sectionId: 'work', parentId: null, done: false, deletedAt: null },
        // 10-01 的子项不计入分母
        { date: '2026-10-01', sectionId: 'work', parentId: 'x', done: false, deletedAt: null },
        // 10-01 软删顶层不计入
        { date: '2026-10-01', sectionId: 'work', parentId: null, done: false, deletedAt: 1 },
      ],
      tasks: [
        { date: '2026-10-01', done: true, deletedAt: null, content: 't1' },
        { date: '2026-10-02', done: false, deletedAt: null, content: 't2' },
      ],
      statuses: [{ date: '2026-10-01', mood: 4, body: 3 }],
    });

    const snapshot = await service.buildSnapshot('2026-10-01', '2026-10-03');

    // 含 10-01 / 10-02 / 10-03 三天
    expect(snapshot.daily).toHaveLength(3);
    const d1 = snapshot.daily[0];
    expect(d1?.date).toBe('2026-10-01');
    // 顶层完成 1 / 总数 2 → overall 0.5
    expect(d1?.sectionDone).toBe(1);
    expect(d1?.sectionTotal).toBe(2);
    expect(d1?.overall).toBeCloseTo(0.5);
    expect(d1?.taskDone).toBe(1);
    expect(d1?.mood).toBe(4);

    // 整体统计：section 完成 1 / 总数 2（跨三天）
    expect(snapshot.totals.totalSectionDone).toBe(1);
    expect(snapshot.totals.totalSectionTotal).toBe(2);
    expect(snapshot.totals.totalTaskTotal).toBe(2);
    expect(snapshot.totals.daysWithData).toBe(2);
  });

  it('空范围返回空 daily 与零统计', async () => {
    const service = buildService({});
    const snapshot = await service.buildSnapshot('2026-12-31', '2026-12-30');
    expect(snapshot.daily).toHaveLength(0);
    expect(snapshot.totals.totalSectionTotal).toBe(0);
    expect(snapshot.totals.avgOverall).toBe(0);
  });
});

describe('AiService.listModels', () => {
  it('未填 Base URL 抛错', async () => {
    const service = buildService({});
    await expect(
      service.listModels({ provider: 'openai-compatible', baseUrl: '', model: '' }, 'k'),
    ).rejects.toThrow(/Base URL/);
  });

  it('有 URL 与密钥时透传网关结果', async () => {
    const service = buildService({});
    const models = await service.listModels(
      { provider: 'openai-compatible', baseUrl: 'https://x/v1', model: '' },
      'k',
    );
    expect(models).toEqual(['model-a', 'model-b']);
  });
});
