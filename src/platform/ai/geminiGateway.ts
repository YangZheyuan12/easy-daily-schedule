import type { AiAnalysisRequest, AiAnalysisResult, AiChatRequest, AiProviderConfig } from '@/domain/types';
import type { AiGateway } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { AI_SYSTEM_PROMPT, AI_CHAT_SYSTEM_PROMPT, buildUserPrompt, buildChatUserPrompt } from './prompt';
import { extractJsonObject, safeErrorText } from './parse';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * Google Gemini 网关。走 `models/{model}:generateContent`，密钥以 query 参数附在 URL
 * （Gemini 官方即支持此方式），并用 `responseMimeType: application/json` 强制 JSON 输出。
 */
export function createGeminiGateway(): AiGateway {
  return {
    async analyze(request: AiAnalysisRequest, config: AiProviderConfig, apiKey: string): Promise<AiAnalysisResult> {
      const url = `${joinUrl(config.baseUrl, `/models/${encodeURIComponent(config.model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${AI_SYSTEM_PROMPT}\n\n${buildUserPrompt(request)}` }],
              },
            ],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
          }),
        });
      } catch {
        throw new DomainError('无法连接到 Gemini，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`Gemini 接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await res.json().catch(() => null);
      const content =
        (data as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] } | null)
          ?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!content) {
        const reason = (data as { candidates?: { finishReason?: string }[] } | null)?.candidates?.[0]?.finishReason;
        throw new DomainError(reason ? `Gemini 未返回内容（finishReason: ${reason}）` : 'Gemini 返回结构异常');
      }
      return extractJsonObject(content) as AiAnalysisResult;
    },

    async chat(request: AiChatRequest, config: AiProviderConfig, apiKey: string): Promise<string> {
      const url = `${joinUrl(config.baseUrl, `/models/${encodeURIComponent(config.model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`;
      const parts = [
        ...request.history.map((m) => ({ text: `${m.role === 'user' ? '用户' : '助手'}：${m.content}` })),
        { text: buildChatUserPrompt(request) },
      ];
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            systemInstruction: { parts: [{ text: AI_CHAT_SYSTEM_PROMPT }] },
            generationConfig: { temperature: 0.5 },
          }),
        });
      } catch {
        throw new DomainError('无法连接到 Gemini，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`Gemini 接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await res.json().catch(() => null);
      const content =
        (data as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] } | null)
          ?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!content.trim()) {
        const reason = (data as { candidates?: { finishReason?: string }[] } | null)?.candidates?.[0]?.finishReason;
        throw new DomainError(reason ? `Gemini 未返回内容（finishReason: ${reason}）` : 'Gemini 返回结构异常');
      }
      return content;
    },

    async testConnection(config: AiProviderConfig, apiKey: string): Promise<void> {
      const url = `${joinUrl(config.baseUrl, '/models')}?key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(url);
      } catch {
        throw new DomainError('无法连接到 Gemini，请检查 Base URL 与网络');
      }
      if (res.status === 400 || res.status === 403) {
        throw new DomainError('连接成功，但密钥无效（400/403）');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`连接成功，但返回 ${res.status}${detail ? `：${detail}` : '（地址或密钥可能不正确）'}`);
      }
    },

    async listModels(config: AiProviderConfig, apiKey: string): Promise<string[]> {
      const url = `${joinUrl(config.baseUrl, '/models')}?key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET' });
      } catch {
        throw new DomainError('无法连接到 Gemini，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(
          res.status === 400 || res.status === 403
            ? '密钥无效（400/403），无法获取模型列表'
            : `获取模型列表失败：${res.status}${detail ? `（${detail}）` : ''}`,
        );
      }
      const data = await res.json().catch(() => null);
      const models = (data as { models?: unknown[] } | null)?.models ?? [];
      return models
        .map((m) => {
          const name = typeof m === 'string' ? m : (m as { name?: string })?.name ?? '';
          return name.replace(/^models\//, '');
        })
        .filter((n): n is string => n.length > 0);
    },
  };
}
