import type { SettingsRepository } from '@/domain/ports';
import { StorageError } from '@/domain/errors';

const PREFIX = 'dsa:';

/**
 * 轻量偏好设置的 localStorage 实现。
 *
 * 只放「丢了也不心疼」的数据（板块改名、折叠态、上次打开的日期等）。
 * ⚠️ 这是本文件唯一允许使用 localStorage 的地方；
 * 迁移小程序时替换为 `wx.getStorageSync` 实现即可。
 */
export class LocalSettingsRepository implements SettingsRepository {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      // 解析失败就当没有，不要因为一条脏配置把整个 App 拖崩
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (error) {
      throw new StorageError('写入偏好设置失败', error);
    }
  }
}

/** 测试与 SSR 场景下的内存实现 */
export class MemorySettingsRepository implements SettingsRepository {
  private readonly map = new Map<string, unknown>();

  async get<T>(key: string, fallback: T): Promise<T> {
    return (this.map.get(key) as T) ?? fallback;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
  }
}
