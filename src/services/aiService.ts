import type {
  AiGateway,
  AiKeyStore,
  Repositories,
} from '@/domain/ports';
import type {
  AiAnalysisRecord,
  AiAnalysisResult,
  AiChatMessage,
  AiChatRequest,
  AiFocus,
  AiInsightCategory,
  AiProvider,
  AiProviderConfig,
  CompletionSnapshot,
  DailyCompletionStat,
} from '@/domain/types';
import { DomainError } from '@/domain/errors';
import type { Clock } from '@/services/clock';
import { shiftDateKey } from '@/utils/date';

/** 固定分析配置的本地偏好键 */
const AI_CONFIG_KEY = 'ai.config';

/**
 * AI 分析服务（纯逻辑，可单测）。
 *
 * 职责：
 * - 配置与密钥的读写（密钥走安全存储，不进 config）；
 * - `buildSnapshot`：把指定日期范围的完成情况**聚合成精简统计**（不碰原始文本，省 token 也护隐私）；
 * - `analyze`：校验已配置 → 取密钥 → 调注入的网关 → 校验返回结构 → 缓存到本地。
 *
 * 业务层永远不认识具体网关实现：网关由 `createGateway` 注入，测试时传假网关即可。
 */
export class AiService {
  constructor(
    private readonly repos: Repositories,
    private readonly keyStore: AiKeyStore,
    private readonly clock: Clock,
    private readonly createGateway: (config: AiProviderConfig) => AiGateway,
  ) {}

  /** 读取用户选择的接入配置（不含密钥） */
  async getConfig(): Promise<AiProviderConfig | null> {
    return this.repos.settings.get<AiProviderConfig | null>(AI_CONFIG_KEY, null);
  }

  /** 保存接入配置（密钥单独走 keyStore） */
  async saveConfig(config: AiProviderConfig): Promise<void> {
    await this.repos.settings.set(AI_CONFIG_KEY, config);
  }

  async saveKey(key: string): Promise<void> {
    await this.keyStore.save(key);
  }

  async clearKey(): Promise<void> {
    await this.keyStore.clear();
  }

  /**
   * 拉取模型列表（UI「获取模型」用）。
   *
   * 仅依赖 Base URL + 密钥，不需要先填模型名。密钥优先用传入值，
   * 没传则回退到已安全存储的密钥（已保存过密钥时无需重复输入）。
   */
  async listModels(config: AiProviderConfig, apiKey?: string): Promise<string[]> {
    if (!config.baseUrl || !config.baseUrl.trim()) {
      throw new DomainError('请先填写 Base URL');
    }
    const key = (apiKey && apiKey.trim()) || (await this.keyStore.load()) || '';
    if (!key.trim()) {
      throw new DomainError('请先填写或保存 API Key（获取模型列表需要鉴权）');
    }
    const gateway = this.createGateway(config);
    return gateway.listModels(config, key);
  }

  /** 是否已具备分析条件：有配置且密钥非空 */
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig();
    if (!config) return false;
    const key = await this.keyStore.load();
    return key !== null && key.trim().length > 0;
  }

  /** 连通性自检：取配置与密钥，调网关最小请求验证可用性 */
  async testConnection(): Promise<void> {
    const config = await this.getConfig();
    if (!config) throw new DomainError('尚未配置 AI 接入：请先在「我的 → AI 助手」里选择厂商');
    const key = await this.keyStore.load();
    if (!key || key.trim().length === 0) {
      throw new DomainError('缺少 API Key：请先在「我的 → AI 助手」里填入密钥');
    }
    const gateway = this.createGateway(config);
    await gateway.testConnection(config, key);
  }

  /** 最近的分析历史 */
  async getHistory(limit = 20): Promise<AiAnalysisRecord[]> {
    return this.repos.aiAnalyses.listRecent(limit);
  }

  /**
   * 聚合并返回指定日期范围的完成情况快照。
   *
   * 用区间批量查询（每张表一次）代替逐日查询，再在内存里按日期分组；
   * 只统计「顶层条目」的完成（与首页环形图口径一致：子项不进分母）。
   */
  async buildSnapshot(rangeStart: string, rangeEnd: string): Promise<CompletionSnapshot> {
    const dates = enumerateDates(rangeStart, rangeEnd);

    const [items, tasks, selfStatusList] = await Promise.all([
      this.repos.items.listByDateRange(rangeStart, rangeEnd),
      this.repos.tasks.listByDateRange(rangeStart, rangeEnd),
      this.repos.selfStatus.listBetween(rangeStart, rangeEnd),
    ]);

    const aliveItems = items.filter((item) => item.deletedAt === null);
    const aliveTasks = tasks.filter((task) => task.deletedAt === null);

    // 按日期分组
    const itemsByDate = groupBy(aliveItems, (item) => item.date);
    const tasksByDate = groupBy(aliveTasks, (task) => task.date);
    const statusByDate = new Map(selfStatusList.map((status) => [status.date, status]));

    // 逐日统计
    const daily: DailyCompletionStat[] = dates.map((date) => {
      const dayItems = itemsByDate.get(date) ?? [];
      const topLevel = dayItems.filter((item) => item.parentId === null);
      const sectionDone = topLevel.filter((item) => item.done).length;
      const sectionTotal = topLevel.length;
      const dayTasks = tasksByDate.get(date) ?? [];
      const taskDone = dayTasks.filter((task) => task.done).length;
      const taskTotal = dayTasks.length;
      const status = statusByDate.get(date);
      return {
        date,
        sectionDone,
        sectionTotal,
        overall: sectionTotal > 0 ? sectionDone / sectionTotal : 0,
        taskDone,
        taskTotal,
        mood: status?.mood ?? 0,
        body: status?.body ?? 0,
      };
    });

    // 期限 / 长时目标进度
    const taskSummary = aliveTasks.map((task) => ({
      id: task.id,
      content: task.content,
      done: task.done,
      kind: task.kind,
    }));

    // 整体统计
    const daysWithData = daily.filter(
      (stat) =>
        stat.sectionTotal > 0 ||
        stat.taskTotal > 0 ||
        stat.mood > 0 ||
        stat.body > 0,
    ).length;
    const sumOverall = daily.reduce((acc, stat) => acc + stat.overall, 0);
    const totals = {
      daysWithData,
      avgOverall: daily.length > 0 ? sumOverall / daily.length : 0,
      totalSectionDone: daily.reduce((acc, stat) => acc + stat.sectionDone, 0),
      totalSectionTotal: daily.reduce((acc, stat) => acc + stat.sectionTotal, 0),
      totalTaskDone: daily.reduce((acc, stat) => acc + stat.taskDone, 0),
      totalTaskTotal: daily.reduce((acc, stat) => acc + stat.taskTotal, 0),
      avgMood: average(daily.map((stat) => stat.mood)),
      avgBody: average(daily.map((stat) => stat.body)),
    };

    return { rangeStart, rangeEnd, daily, taskSummary, totals };
  }

  /**
   * 生成一次 AI 分析。
   *
   * 仅在已配置且密钥存在时可用；结果经结构校验后落本地缓存。
   */
  async analyze(
    rangeStart: string,
    rangeEnd: string,
    focus: AiFocus = 'general',
  ): Promise<AiAnalysisResult> {
    const config = await this.getConfig();
    if (!config) throw new DomainError('尚未配置 AI 接入：请先在「我的 → AI 助手」里选择厂商并填入密钥');
    const key = await this.keyStore.load();
    if (!key || key.trim().length === 0) {
      throw new DomainError('缺少 API Key：请先在「我的 → AI 助手」里填入密钥');
    }

    const snapshot = await this.buildSnapshot(rangeStart, rangeEnd);
    const gateway = this.createGateway(config);
    const result = await gateway.analyze({ snapshot, focus, language: 'zh' }, config, key);

    const validated = validateAnalysis(result, config.model);
    const record: AiAnalysisRecord = {
      id: `${config.provider}@${rangeStart}@${rangeEnd}@${this.clock.now()}`,
      rangeStart,
      rangeEnd,
      focus,
      provider: config.provider as AiProvider,
      model: config.model,
      summary: validated.summary,
      completionRate: validated.completionRate,
      insights: validated.insights,
      generatedAt: this.clock.now(),
    };
    await this.repos.aiAnalyses.put(record);
    return validated;
  }

  /**
   * 对话式问答：基于指定日期范围的完成快照，回应用户的自然语言消息。
   *
   * 与分析（analyze）的区别：返回纯文本而非结构化 JSON，用于「我的」页 AI 对话。
   * 快照范围默认取最近 30 天（够覆盖「最近表现如何」这类问题），
   * 历史消息由调用方维护，这里只负责拼请求 + 调网关。
   */
  async chat(
    message: string,
    history: AiChatMessage[],
    rangeStart: string,
    rangeEnd: string,
  ): Promise<string> {
    const config = await this.getConfig();
    if (!config) throw new DomainError('尚未配置 AI 接入：请先选择厂商并填入密钥');
    const key = await this.keyStore.load();
    if (!key || key.trim().length === 0) {
      throw new DomainError('缺少 API Key：请先填入密钥');
    }

    const snapshot = await this.buildSnapshot(rangeStart, rangeEnd);
    const request: AiChatRequest = {
      snapshot,
      message,
      history,
      language: 'zh',
    };
    const gateway = this.createGateway(config);
    return gateway.chat(request, config, key);
  }
}

/* ----------------------------- 内部工具 ----------------------------- */

function enumerateDates(rangeStart: string, rangeEnd: string): string[] {
  const out: string[] = [];
  if (rangeEnd < rangeStart) return out;
  let current = rangeStart;
  // 防御性上限，避免极端输入导致死循环
  for (let i = 0; i < 4000; i += 1) {
    out.push(current);
    if (current === rangeEnd) break;
    current = shiftDateKey(current, 1);
  }
  return out;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

/** 校验网关返回结构，缺字段或类型不对就抛错（模型跑偏也不崩上层） */
function validateAnalysis(
  value: unknown,
  model: string,
): AiAnalysisResult {
  if (typeof value !== 'object' || value === null) {
    throw new DomainError('AI 返回结果格式异常');
  }
  const raw = value as Record<string, unknown>;
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  const completionRate =
    typeof raw.completionRate === 'number' && Number.isFinite(raw.completionRate)
      ? Math.min(1, Math.max(0, raw.completionRate))
      : 0;
  const insightsRaw = Array.isArray(raw.insights) ? raw.insights : [];
  const insights = insightsRaw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      category: (['rate', 'trend', 'weakspot', 'suggestion', 'streak'].includes(item.category as string)
        ? item.category
        : 'suggestion') as AiInsightCategory,
      title: String(item.title ?? ''),
      detail: String(item.detail ?? ''),
      severity: (['info', 'good', 'warn'].includes(item.severity as string)
        ? item.severity
        : 'info') as 'info' | 'good' | 'warn',
    }));

  return {
    summary,
    completionRate,
    insights,
    model,
    generatedAt: Date.now(),
  };
}
