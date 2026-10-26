import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AiAnalysisRequest, AiProviderConfig } from '@/domain/types';
import { createOpenAiCompatibleGateway } from '../openAiCompatibleGateway';
import { createAnthropicGateway } from '../anthropicGateway';
import { createGeminiGateway } from '../geminiGateway';
import { extractJsonObject } from '../parse';

const CONFIG_OPENAI: AiProviderConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.example.com/v1',
  model: 'test-model',
};
const CONFIG_ANTHROPIC: AiProviderConfig = {
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-x',
};
const CONFIG_GEMINI: AiProviderConfig = {
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-x',
};
const KEY = 'sk-test';

const REQUEST: AiAnalysisRequest = {
  snapshot: {
    rangeStart: '2026-01-01',
    rangeEnd: '2026-01-07',
    daily: [],
    routineSummary: [],
    taskSummary: [],
    totals: {
      daysWithData: 0,
      avgOverall: 0,
      totalSectionDone: 0,
      totalSectionTotal: 0,
      totalTaskDone: 0,
      totalTaskTotal: 0,
      totalRoutineDone: 0,
      totalRoutineTotal: 0,
      avgMood: 0,
      avgBody: 0,
    },
  },
  focus: 'general',
  language: 'zh',
};

function mockFetch(payload: unknown, { ok = true, status = 200 } = {}) {
  const res = {
    ok,
    status,
    json: async () => payload,
    text: async () => '',
  } as unknown as Response;
  vi.stubGlobal('fetch', vi.fn(async () => res));
}

const JSON_BODY = '{"summary":"完成不错","completionRate":0.8,"insights":[{"category":"streak","title":"坚持打卡","detail":"连续完成固定任务","severity":"good"}]}';

describe('extractJsonObject', () => {
  it('strips ```json fences', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('finds JSON embedded in prose', () => {
    const raw = `好的，结果如下：\n${JSON_BODY}\n以上。`;
    expect(extractJsonObject(raw)).toMatchObject({ summary: '完成不错', completionRate: 0.8 });
  });
  it('throws when no JSON present', () => {
    expect(() => extractJsonObject('no json here')).toThrow();
  });
});

describe('OpenAI 兼容网关', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('从 choices[0].message.content 解析结果并带鉴权头', async () => {
    mockFetch({ choices: [{ message: { content: JSON_BODY } }] });
    const res = await createOpenAiCompatibleGateway().analyze(REQUEST, CONFIG_OPENAI, KEY);
    expect(res.completionRate).toBe(0.8);
    const fetchMock = (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/chat/completions');
    expect(opts.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('testConnection：401 抛「密钥无效」', async () => {
    mockFetch({}, { ok: false, status: 401 });
    await expect(createOpenAiCompatibleGateway().testConnection(CONFIG_OPENAI, KEY)).rejects.toThrow(/401/);
  });

  it('testConnection：200 通过', async () => {
    mockFetch({}, { ok: true, status: 200 });
    await expect(createOpenAiCompatibleGateway().testConnection(CONFIG_OPENAI, KEY)).resolves.toBeUndefined();
  });
});

describe('Anthropic 网关', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('从 content[0].text 解析结果并带 x-api-key 头', async () => {
    mockFetch({ content: [{ text: JSON_BODY }] });
    const res = await createAnthropicGateway().analyze(REQUEST, CONFIG_ANTHROPIC, KEY);
    expect(res.summary).toBe('完成不错');
    const fetchMock = (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/messages');
    expect(opts.headers['x-api-key']).toBe(KEY);
    expect(opts.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});

describe('Gemini 网关', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('从 candidates[0].content.parts[0].text 解析结果', async () => {
    mockFetch({ candidates: [{ content: { parts: [{ text: JSON_BODY }] } }] });
    const res = await createGeminiGateway().analyze(REQUEST, CONFIG_GEMINI, KEY);
    expect(res.insights.length).toBe(1);
    const fetchMock = (globalThis as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain(`models/${encodeURIComponent(CONFIG_GEMINI.model)}:generateContent`);
    expect(url).toContain(`key=${encodeURIComponent(KEY)}`);
  });
});
