import type { AiAnalysisRequest, AiAnalysisResult, AiProviderConfig } from '@/domain/types';
import type { AiGateway } from '@/domain/ports';
import { DomainError } from '@/domain/errors';
import { AI_SYSTEM_PROMPT, buildUserPrompt } from './prompt';
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
  };
}
