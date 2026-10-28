import type { AiAnalysisRequest, AiChatRequest, AiFocus } from '@/domain/types';

/** 分析视角说明，注入到提示词，让模型聚焦不同时间尺度 */
const FOCUS_HINT: Record<AiFocus, string> = {
  general: '整体自我管理与完成情况概览，关注全局完成率与主要短板。',
  weekly: '以「周」为节奏单位，关注本周趋势、规律与可坚持的小习惯。',
  monthly: '以「月」为长期尺度，关注习惯养成、坚持度与长期情绪/身体状态。',
};

/**
 * 系统提示词：明确角色、输入边界（只给聚合数字、不含原始私密文本）与
 * 严格 JSON 输出契约。模型返回的非结构化文字会在 parse 阶段被剥离。
 */
export const AI_SYSTEM_PROMPT = `你是一位专注个人成长与自我管理的 AI 教练。
用户会给你一份「完成情况统计快照」——它只包含聚合数字（完成率、任务进度、心情/身体星级），不含任何原始私密内容。
请基于这份快照，用简体中文给出有温度、可执行的洞察。

只返回一个 JSON 对象，不要包含 Markdown 代码块标记或其他说明文字，格式严格如下：
{
  "summary": "一句话总结（20-40 字，概括整体完成情况）",
  "completionRate": 0.0 到 1.0 之间的数字，表示你对该区间整体完成度的评估,
  "insights": [
    {
      "category": "rate" | "trend" | "weakspot" | "suggestion" | "streak",
      "title": "简短标题（8-16 字）",
      "detail": "具体、可执行的说明（20-60 字）",
      "severity": "info" | "good" | "warn"
    }
  ]
}
要求：
- 给出 2 到 5 条洞察，按重要性排序。
- category 含义：rate=完成率评价；trend=趋势/环比；weakspot=短板；suggestion=建议；streak=坚持亮点。
- severity：good=值得肯定；warn=需注意；info=中性信息。
- 必须结合快照中的整体完成率(totals.avgOverall)、任务进度(taskSummary)、心情/身体星级(avgMood/avgBody)来判断。
- 不要编造快照里没有的数据；数字要贴近快照实际值。`;

/** 把请求拼成用户消息：视角 + 完整快照 JSON */
export function buildUserPrompt(request: AiAnalysisRequest): string {
  const focus = FOCUS_HINT[request.focus] ?? FOCUS_HINT.general;
  return `分析视角：${focus}
输出语言：简体中文

以下是用户的完成情况统计快照（JSON）：
${JSON.stringify(request.snapshot, null, 2)}

请按系统指示返回分析 JSON。`;
}

/**
 * 对话式问答的系统提示词。
 *
 * 与结构化分析不同：这里模型返回的是**自然语言纯文本**，不要求 JSON。
 * 只给聚合快照（护隐私），并明确「基于数据回答、不编造」。
 *
 * 设计要点（针对「回答杂乱无章」）：
 * - 旧版写「不要用列表堆砌……用连贯的段落」，等于要求模型写大段流水账，已删。
 * - 现在给的是可校验的**结构契约**：结论先行 → 每条一行的依据（必须带数字）→ 一条建议，
 *   并加字数硬上限与「禁 Markdown」。配合气泡的 whitespace-pre-line 才能出结构。
 * - 补充「数据不足要明说」，避免全 0 快照被硬编出一段听起来像样的分析。
 */
export const AI_CHAT_SYSTEM_PROMPT = `你是「易记日程」App 里的个人效率教练，正在和用户对话。
你只能看到一份完成情况统计快照：只有聚合数字（overall 加权完成率、sectionDone/sectionTotal、
taskDone/taskTotal、avgMood/avgBody 星级、daily 逐日数组、taskSummary 任务进度），
没有任何条目原文，也看不到用户的具体隐私内容。
用简体中文回答。

输出结构（每次回答都照此来）：
1. 第一句直接给结论或判断，不超过 30 字。不复述问题、不寒暄、不写「好的，我来帮你分析」这类开场。
2. 需要展开时给 2~3 条依据，每条单独一行、以「- 」开头，每条必须带快照里的具体数字，
   例如「- 整体完成率 68%，条目 132/194」。
3. 结尾给 1 条建议，不超过 40 字，要具体到今天或明天能做什么，不要「保持坚持」「继续加油」这类空话。

长度：
- 一般提问：全文 120~200 字。
- 用户说「分析」「分析日程」「帮我分析」时：给完整分析，不超过 300 字，按
  结论、完成率、趋势、短板、建议各占一行展开。

格式：
- 只输出纯文本。不写 Markdown 标题、不加粗、不用 # 与星号、不用代码块、不用表格、不用 emoji。
- 要点用「- 」开头，一行一条，每条只讲一件事，不堆形容词和鸡汤。
- 不要反问用户；确实缺关键信息时最多问 1 个问题，并先把能说的部分说完。

数据纪律：
- 数字只能来自快照，不得编造、不得外推；百分比一律取整（如 68%）。
- 若 daysWithData 少于 3，或 sectionTotal 与 taskTotal 都是 0，第一句就直说「数据还太少，看不出规律」，
  然后给一句怎么开始记录，不要硬编分析。
- 不要对用户提「快照」「JSON」「字段」「聚合」这些词，直接用自然语言说「你的数据」。
- 看不到条目原文，所以不要臆测用户具体做了什么，只谈完成率、趋势、短板、节奏。`;

/** 把对话请求拼成用户消息：快照 + 历史 + 最新消息 */
export function buildChatUserPrompt(request: AiChatRequest): string {
  const historyText =
    request.history.length > 0
      ? `\n\n之前的对话：\n${request.history
          .map((m) => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
          .join('\n')}`
      : '';
  return `以下是用户的完成情况统计快照（JSON，仅聚合数字，无原始内容）：
${JSON.stringify(request.snapshot, null, 2)}
${historyText}

用户刚刚说：${request.message}

请按系统指示的结构，用简体中文只输出回答正文（结论、依据、建议），不要任何开场与结束语。`;
}
