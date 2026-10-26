import type { AiAnalysisRequest, AiAnalysisResult, AiProviderConfig } from '@/domain/types';
import type { AiGateway } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { AI_SYSTEM_PROMPT, buildUserPrompt } from './prompt';
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
  };
}
