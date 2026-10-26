import type { AiAnalysisRepository } from '@/domain/ports';
import type { AiAnalysisRecord } from '@/domain/types';
import { StorageError } from '@/domain/errors';
import type { AppDatabase } from './db/DexieDatabase';

/**
 * AI 分析历史缓存仓储（IndexedDB）。
 *
 * 分析结果是纯本机数据，不参与同步；主键 id 由 aiService 生成
 * （形如 `${provider}@${rangeStart}@${rangeEnd}@${ts}`），天然可去重。
 */
export class IndexedDbAiAnalysisRepository implements AiAnalysisRepository {
  constructor(private readonly db: AppDatabase) {}

  async put(record: AiAnalysisRecord): Promise<void> {
    try {
      await this.db.aiAnalyses.put(record);
    } catch (error) {
      throw new StorageError('写入 AI 分析记录失败', error);
    }
  }

  async listRecent(limit = 20): Promise<AiAnalysisRecord[]> {
    try {
      const rows = await this.db.aiAnalyses.orderBy('generatedAt').reverse().toArray();
      return rows.slice(0, limit);
    } catch (error) {
      throw new StorageError('读取 AI 分析历史失败', error);
    }
  }

  async get(id: string): Promise<AiAnalysisRecord | undefined> {
    try {
      return (await this.db.aiAnalyses.get(id)) ?? undefined;
    } catch (error) {
      throw new StorageError('读取 AI 分析记录失败', error);
    }
  }
}
