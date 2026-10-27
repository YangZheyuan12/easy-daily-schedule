import { describe, it, expect } from 'vitest';
import { AI_VENDOR_PRESETS, findVendorPreset } from '../index';
import type { AiProviderConfig } from '@/domain/types';

const KEYS = AI_VENDOR_PRESETS.map((p) => p.key);

describe('AI 厂商预设', () => {
  it('常见大厂都预填了 URL 与默认模型', () => {
    for (const key of ['openai', 'deepseek', 'kimi', 'glm', 'doubao', 'qwen', 'anthropic', 'gemini']) {
      const preset = AI_VENDOR_PRESETS.find((p) => p.key === key);
      expect(preset, `缺少预设 ${key}`).toBeDefined();
      expect(preset!.baseUrl, `${key} 应有 baseUrl`).not.toBe('');
      expect(preset!.model, `${key} 应有默认 model`).not.toBe('');
    }
  });

  it('最后一项是「自定义」（baseUrl 为空）', () => {
    const last = AI_VENDOR_PRESETS[AI_VENDOR_PRESETS.length - 1];
    expect(last.key).toBe('custom');
    expect(last.baseUrl).toBe('');
  });

  it('国产大模型统一走 openai-compatible 网关', () => {
    for (const key of ['openai', 'deepseek', 'kimi', 'glm', 'doubao', 'qwen', 'custom']) {
      const preset = AI_VENDOR_PRESETS.find((p) => p.key === key)!;
      expect(preset.gatewayProvider).toBe('openai-compatible');
    }
  });

  it('findVendorPreset 按 baseUrl 反查预设', () => {
    const config: AiProviderConfig = {
      provider: 'openai-compatible',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    };
    expect(findVendorPreset(config).key).toBe('deepseek');
  });

  it('findVendorPreset 匹配不上（手填 URL）归到自定义', () => {
    const config: AiProviderConfig = {
      provider: 'openai-compatible',
      baseUrl: 'https://my-private-endpoint.example/v1',
      model: 'x',
    };
    expect(findVendorPreset(config).key).toBe('custom');
  });

  it('preset key 不重复', () => {
    expect(new Set(KEYS).size).toBe(KEYS.length);
  });
});
