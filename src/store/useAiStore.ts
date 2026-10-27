import { create } from 'zustand';
import type { AiAnalysisRecord, AiAnalysisResult, AiChatMessage, AiFocus, AiProviderConfig } from '@/domain/types';
import { aiService } from './bootstrap';

/** 对话里的展示消息（含「正在输入」占位） */
export interface ChatItem {
  role: 'user' | 'assistant';
  content: string;
}

interface AiState {
  /** 当前接入配置（不含密钥） */
  config: AiProviderConfig | null;
  /** 是否已保存过密钥（不暴露密钥本身） */
  keySet: boolean;
  /** 加载 / 保存中 */
  busy: boolean;
  /** 最近一次错误（已归一化为用户可读文案） */
  error: string | null;
  /** 拉取到的模型名列表（「获取模型」结果） */
  models: string[];
  /** 正在获取模型列表 */
  fetchingModels: boolean;
  /** 获取模型列表时的错误 */
  modelError: string | null;
  /** 分析历史 */
  history: AiAnalysisRecord[];
  /** 对话消息列表（我的页 AI 聊天） */
  chat: ChatItem[];

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
  /** 拉取模型列表（「获取模型」按钮） */
  fetchModels: (config: AiProviderConfig, apiKey?: string) => Promise<string[]>;
  /** 清空已拉取的模型列表（切换厂商 / 改地址时调用） */
  clearModels: () => void;
  /** 清空对话 */
  clearChat: () => void;
  /**
   * 发送一条对话消息，返回 AI 回复文本。
   * rangeStart/rangeEnd 由调用方给出（默认最近 30 天）。
   */
  sendMessage: (message: string, rangeStart: string, rangeEnd: string) => Promise<string>;
}

export const useAiStore = create<AiState>((set, get) => ({
  config: null,
  keySet: false,
  busy: false,
  error: null,
  models: [],
  fetchingModels: false,
  modelError: null,
  history: [],
  chat: [],

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

  async fetchModels(config, apiKey) {
    set({ fetchingModels: true, modelError: null });
    try {
      const models = await aiService.listModels(config, apiKey);
      set({ models, fetchingModels: false });
      return models;
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取模型列表失败';
      set({ fetchingModels: false, modelError: message });
      throw error;
    }
  },

  clearModels() {
    set({ models: [], modelError: null });
  },

  clearChat() {
    set({ chat: [] });
  },

  async sendMessage(message, rangeStart, rangeEnd) {
    const trimmed = message.trim();
    if (!trimmed) return '';
    // 当前对话作为历史发给模型（不含刚追加的用户消息）
    const history: AiChatMessage[] = get().chat.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    set((state) => ({
      chat: [...state.chat, { role: 'user', content: trimmed }],
      busy: true,
      error: null,
    }));
    try {
      const reply = await aiService.chat(trimmed, history, rangeStart, rangeEnd);
      set((state) => ({
        chat: [...state.chat, { role: 'assistant', content: reply }],
        busy: false,
      }));
      return reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 回复失败';
      set((state) => ({
        chat: [...state.chat, { role: 'assistant', content: `抱歉，出错了：${message}` }],
        busy: false,
        error: message,
      }));
      return '';
    }
  },
}));
