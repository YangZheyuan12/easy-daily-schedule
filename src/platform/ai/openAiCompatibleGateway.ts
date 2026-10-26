import type { AiAnalysisRequest, AiAnalysisResult, AiChatRequest, AiProviderConfig } from '@/domain/types';
import type { AiGateway } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { AI_SYSTEM_PROMPT, AI_CHAT_SYSTEM_PROMPT, buildUserPrompt, buildChatUserPrompt } from './prompt';
import { extractJsonObject, safeErrorText } from './parse';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * OpenAI 兼容网关：兼容官方 OpenAI，以及 DeepSeek / GLM / 通义 / Kimi 等
 * 提供 OpenAI 格式接口的国产模型。统一走 `/chat/completions` + JSON mode。
 */
export function createOpenAiCompatibleGateway(): AiGateway {
  return {
    async analyze(request: AiAnalysisRequest, config: AiProviderConfig, apiKey: string): Promise<AiAnalysisResult> {
      const url = joinUrl(config.baseUrl, '/chat/completions');
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            response_format: { type: 'json_object' },
            temperature: 0.4,
            messages: [
              { role: 'system', content: AI_SYSTEM_PROMPT },
              { role: 'user', content: buildUserPrompt(request) },
            ],
          }),
        });
      } catch {
        throw new DomainError('无法连接到该地址，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`OpenAI 兼容接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await res.json().catch(() => null);
      const content = (data as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]?.message?.content ?? '';
      return extractJsonObject(content) as AiAnalysisResult;
    },

    async chat(request: AiChatRequest, config: AiProviderConfig, apiKey: string): Promise<string> {
      const url = joinUrl(config.baseUrl, '/chat/completions');
      const messages = [
        { role: 'system', content: AI_CHAT_SYSTEM_PROMPT },
        ...request.history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: buildChatUserPrompt(request) },
      ];
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0.5,
            messages,
          }),
        });
      } catch {
        throw new DomainError('无法连接到该地址，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`OpenAI 兼容接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await res.json().catch(() => null);
      const content = (data as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) throw new DomainError('AI 未返回内容');
      return content;
    },

    async testConnection(config: AiProviderConfig, apiKey: string): Promise<void> {
      const url = joinUrl(config.baseUrl, '/chat/completions');
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
      } catch {
        throw new DomainError('无法连接到该地址，请检查 Base URL 与网络');
      }
      if (res.status === 401) {
        throw new DomainError('连接成功，但密钥无效（401）');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`连接成功，但返回 ${res.status}${detail ? `：${detail}` : '（地址或密钥可能不正确）'}`);
      }
    },
  };
}
