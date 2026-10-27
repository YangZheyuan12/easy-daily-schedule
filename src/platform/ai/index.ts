import type { AiGateway } from '@/domain/ports';
import type { AiProviderConfig } from '@/domain/types';
import { createOpenAiCompatibleGateway } from './openAiCompatibleGateway';
import { createAnthropicGateway } from './anthropicGateway';
import { createGeminiGateway } from './geminiGateway';

export { createOpenAiCompatibleGateway, createAnthropicGateway, createGeminiGateway };

/**
 * AI 网关工厂。
 *
 * 与 `createRepositories` 一样是「选实现的唯一装配点」：按用户配置的 provider
 * 返回对应网关。上层 `aiService` 与 UI 完全不知道具体是哪家 —— 换厂商只改这里。
 */
export function createAiGateway(config: AiProviderConfig): AiGateway {
  switch (config.provider) {
    case 'anthropic':
      return createAnthropicGateway();
    case 'gemini':
      return createGeminiGateway();
    case 'custom':
    case 'openai-compatible':
    default:
      return createOpenAiCompatibleGateway();
  }
}

/** 各厂商的默认 Base URL 与模型（切换厂商时回填到配置表单） */
export const AI_PROVIDER_DEFAULTS: Record<
  AiProviderConfig['provider'],
  { baseUrl: string; model: string; label: string }
> = {
  'openai-compatible': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI 兼容（含国产模型）',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    label: 'Anthropic（Claude）',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-flash',
    label: 'Google Gemini',
  },
  custom: {
    baseUrl: '',
    model: '',
    label: '自定义（任意 OpenAI 兼容端点）',
  },
};
