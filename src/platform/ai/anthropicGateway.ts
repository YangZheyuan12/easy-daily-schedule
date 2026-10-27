import type { AiAnalysisRequest, AiAnalysisResult, AiChatRequest, AiProviderConfig } from '@/domain/types';
import type { AiGateway } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { AI_SYSTEM_PROMPT, AI_CHAT_SYSTEM_PROMPT, buildUserPrompt, buildChatUserPrompt } from './prompt';
import { extractJsonObject, safeErrorText } from './parse';

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`;
}

/**
 * Anthropic（Claude）网关。
 *
 * 🔴 浏览器直连必须带 `anthropic-dangerous-direct-browser-access: true`，
 * 否则 Claude 会拒绝来自浏览器的跨域请求。这会让前端持有密钥——
 * 本应用是「用户自带 API」的本地优先工具，属预期；集中式后端产品不应这么用。
 */
export function createAnthropicGateway(): AiGateway {
  return {
    async analyze(request: AiAnalysisRequest, config: AiProviderConfig, apiKey: string): Promise<AiAnalysisResult> {
      const url = joinUrl(config.baseUrl, '/messages');
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 1024,
            system: AI_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildUserPrompt(request) }],
          }),
        });
      } catch {
        throw new DomainError('无法连接到 Anthropic，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`Anthropic 接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await res.json().catch(() => null);
      const content = (data as { content?: { text?: string }[] } | null)?.content?.[0]?.text ?? '';
      return extractJsonObject(content) as AiAnalysisResult;
    },

    async chat(request: AiChatRequest, config: AiProviderConfig, apiKey: string): Promise<string> {
      const url = joinUrl(config.baseUrl, '/messages');
      const messages = [
        ...request.history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: buildChatUserPrompt(request) },
      ];
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 1024,
            system: AI_CHAT_SYSTEM_PROMPT,
            messages,
          }),
        });
      } catch {
        throw new DomainError('无法连接到 Anthropic，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`Anthropic 接口返回 ${res.status}${detail ? `：${detail}` : ''}`);
      }
      const data = await res.json().catch(() => null);
      const content = (data as { content?: { text?: string }[] } | null)?.content?.[0]?.text ?? '';
      if (!content.trim()) throw new DomainError('AI 未返回内容');
      return content;
    },

    async testConnection(config: AiProviderConfig, apiKey: string): Promise<void> {
      const url = joinUrl(config.baseUrl, '/messages');
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }),
        });
      } catch {
        throw new DomainError('无法连接到 Anthropic，请检查 Base URL 与网络');
      }
      if (res.status === 401) {
        throw new DomainError('连接成功，但密钥无效（401）');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(`连接成功，但返回 ${res.status}${detail ? `：${detail}` : '（地址或密钥可能不正确）'}`);
      }
    },

    async listModels(config: AiProviderConfig, apiKey: string): Promise<string[]> {
      const url = joinUrl(config.baseUrl, '/models');
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        });
      } catch {
        throw new DomainError('无法连接到 Anthropic，请检查 Base URL 与网络');
      }
      if (!res.ok) {
        const detail = await safeErrorText(res);
        throw new DomainError(
          res.status === 401
            ? '密钥无效（401），无法获取模型列表'
            : `获取模型列表失败：${res.status}${detail ? `（${detail}）` : ''}`,
        );
      }
      const data = await res.json().catch(() => null);
      const list = (data as { data?: unknown[] } | null)?.data ?? [];
      return list
        .map((m) => (typeof m === 'string' ? m : (m as { id?: string })?.id ?? ''))
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
    },
  };
}
