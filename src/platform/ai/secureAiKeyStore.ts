import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { AiKeyStore } from '@/domain/ports';

/**
 * AI API Key 安全存储。
 *
 * 与 `platform/auth/secureTokenStore.ts` 同构：密钥是敏感信息，绝不进 IndexedDB /
 * localStorage 明文。这里用同一套 **AES-GCM 信封** 方案 —— 每设备随机生成数据密钥，
 * 密文与数据密钥同存于后端（Preferences / localStorage），能挡住「备份文件 / 偏好文件
 * 被直接读取看到明文 key」这类场景。`crypto.subtle` 不可用时自动退回明文，绝不因此丢 key。
 *
 * 🔴 诚实说明：Preferences 不是 Keychain / EncryptedSharedPreferences（社区安全插件
 * 当前网络装不上）。这是当前约束下的 proportionate 方案，不是硬件级安全存储的等价物。
 */
const KEY_ITEM = 'ai.key.v1';
const ENC_KEY_ITEM = 'ai.key.enc.v1';

interface EncryptedEnvelope {
  v: 1;
  alg: 'AES-GCM' | 'plain';
  data: string;
  iv?: string;
}

function hasSubtle(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'alg' in value &&
    'data' in value &&
    typeof (value as { data: unknown }).data === 'string'
  );
}

export class SecureAiKeyStore implements AiKeyStore {
  private memory: string | null = null;

  async save(key: string): Promise<void> {
    this.memory = key;
    let payload: string;
    const encKey = await this.dataKey();
    if (encKey) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(key);
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, encoded);
      payload = JSON.stringify({
        v: 1,
        alg: 'AES-GCM',
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(cipher)),
      } satisfies EncryptedEnvelope);
    } else {
      payload = JSON.stringify({ v: 1, alg: 'plain', data: key } satisfies EncryptedEnvelope);
    }
    await this.backendSet(KEY_ITEM, payload);
  }

  async load(): Promise<string | null> {
    let raw: string | null = null;
    try {
      raw = await this.backendGet(KEY_ITEM);
    } catch {
      raw = null;
    }
    if (raw === null) return this.memory;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return this.memory;
    }

    if (!isEnvelope(parsed)) {
      this.memory = parsed as string;
      return this.memory;
    }

    if (parsed.alg === 'plain') {
      try {
        const key = JSON.parse(parsed.data) as string;
        this.memory = key;
        return key;
      } catch {
        return this.memory;
      }
    }

    try {
      const encKey = await this.dataKey();
      if (!encKey || !parsed.iv) return this.memory;
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(parsed.iv) },
        encKey,
        base64ToBytes(parsed.data),
      );
      const key = new TextDecoder().decode(plain);
      this.memory = key;
      return key;
    } catch {
      return this.memory;
    }
  }

  async clear(): Promise<void> {
    this.memory = null;
    try {
      await this.backendRemove(KEY_ITEM);
      await this.backendRemove(ENC_KEY_ITEM);
    } catch {
      // 忽略：内存已清
    }
  }

  private async dataKey(): Promise<CryptoKey | null> {
    if (!hasSubtle()) return null;
    try {
      const existing = await this.backendGet(ENC_KEY_ITEM);
      if (existing) {
        return await crypto.subtle.importKey(
          'raw',
          base64ToBytes(existing),
          'AES-GCM',
          true,
          ['encrypt', 'decrypt'],
        );
      }
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
        'encrypt',
        'decrypt',
      ]);
      const raw = await crypto.subtle.exportKey('raw', key);
      await this.backendSet(ENC_KEY_ITEM, bytesToBase64(new Uint8Array(raw)));
      return key;
    } catch {
      return null;
    }
  }

  private async backendGet(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private async backendSet(key: string, value: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      // 留内存兜底
    }
  }

  private async backendRemove(key: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key });
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // 忽略
    }
  }
}
