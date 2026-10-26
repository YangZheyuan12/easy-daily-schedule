import { create } from 'zustand';
import type { AiAnalysisRecord, AiAnalysisResult, AiFocus, AiProviderConfig } from '@/domain/types';
import { aiService } from './bootstrap';

interface AiState {
  /** 当前接入配置（不含密钥） */
  config: AiProviderConfig | null;
  /** 是否已保存过密钥（不暴露密钥本身） */
  keySet: boolean;
  /** 加载 / 保存中 */
  busy: boolean;
  /** 最近一次错误（已归一化为用户可读文案） */
  error: string | null;
  /** 分析历史 */
  history: AiAnalysisRecord[];

  /** 启动时拉一次配置与密钥标记 */
  load: () => Promise<void>;
  /** 保存接入配置；若传入 key 则一并写入安全存储 */
  saveConfig: (config: AiProviderConfig, key?: string) => Promise<void>;
  /** 清除已保存的密钥 */
  clearKey: () => Promise<void>;
  /** 拉取分析历史 */
  loadHistory: () => Promise<void>;
  /** 生成一次分析 */
  runAnalysis: (rangeStart: string, rangeEnd: string, focus: AiFocus) => Promise<AiAnalysisResult>;
  /** 连通性自检 */
  testConnection: () => Promise<void>;
}

export const useAiStore = create<AiState>((set) => ({
  config: null,
  keySet: false,
  busy: false,
  error: null,
  history: [],

  async load() {
    try {
      const [config, keySet] = await Promise.all([aiService.getConfig(), aiService.isConfigured()]);
      set({ config, keySet, error: null });
    } catch {
      set({ config: null, keySet: false });
    }
  },

  async saveConfig(config, key) {
    set({ busy: true, error: null });
    try {
      await aiService.saveConfig(config);
      if (key !== undefined && key.length > 0) {
        await aiService.saveKey(key);
      }
      const keySet = await aiService.isConfigured();
      set({ config, keySet, busy: false });
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : '保存失败' });
    }
  },

  async clearKey() {
    try {
      await aiService.clearKey();
      set({ keySet: false });
    } catch {
      set({ keySet: false });
    }
  },

  async loadHistory() {
    try {
      const history = await aiService.getHistory();
      set({ history });
    } catch {
      set({ history: [] });
    }
  },

  async runAnalysis(rangeStart, rangeEnd, focus) {
    set({ busy: true, error: null });
    try {
      const result = await aiService.analyze(rangeStart, rangeEnd, focus);
      const history = await aiService.getHistory();
      set({ busy: false, history });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '分析失败';
      set({ busy: false, error: message });
      throw error;
    }
  },

  async testConnection() {
    set({ busy: true, error: null });
    try {
      await aiService.testConnection();
      set({ busy: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接测试失败';
      set({ busy: false, error: message });
      throw error;
    }
  },
}));
