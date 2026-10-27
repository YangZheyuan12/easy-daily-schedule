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

/**
 * 厂商预设：下拉直接选，Base URL / 默认模型已填好，不用手敲地址。
 *
 * 国产大模型（DeepSeek / Kimi / 智谱 GLM / 豆包 / 通义千问）都是 OpenAI 兼容协议，
 * 统一走 `openai-compatible` 网关；只有 Anthropic / Gemini 用各自网关。
 * `key` 是下拉项的稳定标识；选中某个预设时，把它的 `gatewayProvider` 写进配置
 * （配置里只存网关类型 + 具体 URL，不存「厂商名」）。
 */
export interface AiVendorPreset {
  key: string;
  gatewayProvider: AiProviderConfig['provider'];
  baseUrl: string;
  model: string;
  label: string;
}

export const AI_VENDOR_PRESETS: AiVendorPreset[] = [
  {
    key: 'openai',
    gatewayProvider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI',
  },
  {
    key: 'deepseek',
    gatewayProvider: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    label: 'DeepSeek',
  },
  {
    key: 'kimi',
    gatewayProvider: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    label: 'Kimi（月之暗面）',
  },
  {
    key: 'glm',
    gatewayProvider: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    label: '智谱 GLM',
  },
  {
    key: 'doubao',
    gatewayProvider: 'openai-compatible',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1.6-250615',
    label: '豆包（火山方舟）',
  },
  {
    key: 'qwen',
    gatewayProvider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    label: '通义千问（阿里云）',
  },
  {
    key: 'anthropic',
    gatewayProvider: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-latest',
    label: 'Anthropic（Claude）',
  },
  {
    key: 'gemini',
    gatewayProvider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-1.5-flash',
    label: 'Google Gemini',
  },
  {
    key: 'custom',
    gatewayProvider: 'openai-compatible',
    baseUrl: '',
    model: '',
    label: '自定义（手动填写 URL）',
  },
];

/** 根据已存配置反查它对应哪个厂商预设；匹配不上（手填 URL）则归到「自定义」 */
export function findVendorPreset(config: AiProviderConfig): AiVendorPreset {
  return (
    AI_VENDOR_PRESETS.find((p) => p.baseUrl !== '' && p.baseUrl === config.baseUrl) ??
    AI_VENDOR_PRESETS[AI_VENDOR_PRESETS.length - 1]
  );
}
