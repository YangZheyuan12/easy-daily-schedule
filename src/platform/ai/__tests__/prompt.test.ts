import { describe, it, expect } from 'vitest';
import { AI_CHAT_SYSTEM_PROMPT, AI_SYSTEM_PROMPT, buildChatUserPrompt } from '../prompt';
import type { AiChatRequest, CompletionSnapshot } from '@/domain/types';

/** 最小快照：对话 prompt 只需要能序列化进去 */
function makeSnapshot(): CompletionSnapshot {
  return {
    rangeStart: '2026-10-01',
    rangeEnd: '2026-10-28',
    daily: [
      {
        date: '2026-10-28',
        sectionDone: 3,
        sectionTotal: 5,
        overall: 0.6,
        taskDone: 1,
        taskTotal: 2,
        mood: 3,
        body: 4,
      },
    ],
    taskSummary: [{ id: 't1', content: '写周报', done: false, kind: 'deadline' }],
    totals: {
      daysWithData: 1,
      avgOverall: 0.6,
      totalSectionDone: 3,
      totalSectionTotal: 5,
      totalTaskDone: 1,
      totalTaskTotal: 2,
      avgMood: 3,
      avgBody: 4,
    },
  };
}

function makeRequest(overrides: Partial<AiChatRequest> = {}): AiChatRequest {
  return {
    snapshot: makeSnapshot(),
    message: '我这周表现如何',
    history: [],
    language: 'zh',
    ...overrides,
  };
}

describe('对话系统提示词契约', () => {
  it('要求结论先行（第一句给结论，不复述问题）', () => {
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('第一句直接给结论');
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('不复述问题');
  });

  it('要求每条依据带快照里的具体数字', () => {
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('必须带快照里的具体数字');
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('不得编造');
  });

  it('禁用 Markdown（气泡按纯文本渲染，符号会原样露出来）', () => {
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('只输出纯文本');
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('Markdown');
  });

  it('数据不足时要求明说，不许硬编', () => {
    expect(AI_CHAT_SYSTEM_PROMPT).toContain('数据还太少');
  });

  it('不再要求「用连贯的段落」（旧版正是让人写大段流水账的原因）', () => {
    expect(AI_CHAT_SYSTEM_PROMPT).not.toContain('连贯的段落');
    expect(AI_CHAT_SYSTEM_PROMPT).not.toContain('不要用列表堆砌');
  });

  it('结构化分析 prompt 仍要求严格 JSON（未被对话改造波及）', () => {
    expect(AI_SYSTEM_PROMPT).toContain('只返回一个 JSON 对象');
  });
});

describe('buildChatUserPrompt', () => {
  it('带上快照 JSON 与用户最新消息', () => {
    const text = buildChatUserPrompt(makeRequest());
    expect(text).toContain('"rangeStart": "2026-10-01"');
    expect(text).toContain('用户刚刚说：我这周表现如何');
  });

  it('有历史时按「用户 / 助手」逐条拼接', () => {
    const text = buildChatUserPrompt(
      makeRequest({
        history: [
          { role: 'user', content: '上周呢' },
          { role: 'assistant', content: '- 整体完成率 50%' },
        ],
      }),
    );
    expect(text).toContain('用户：上周呢');
    expect(text).toContain('助手：- 整体完成率 50%');
  });

  it('无历史时不出现空的「之前的对话」段落', () => {
    const text = buildChatUserPrompt(makeRequest());
    expect(text).not.toContain('之前的对话');
  });
});
