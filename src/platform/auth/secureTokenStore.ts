import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { AuthToken } from '@/domain/types';
import type { TokenStore } from '@/domain/ports';

/**
 * 鉴权令牌安全存储。
 *
 * 后端按运行环境二选一：
 * - **原生壳（Capacitor）**：`@capacitor/preferences`（iOS UserDefaults /
 *   Android SharedPreferences）。相比 WebView 的 localStorage，它有两个实打实的
 *   好处：① 不随 iOS 回收 WKWebView 站点数据而丢失；② 只在 App 沙盒内可见。
 * - **Web**：localStorage（唯一可选）。
 *
 * 🔴 诚实说明：Preferences **不是** Keychain / EncryptedSharedPreferences。
 * 生产级安全存储需要社区插件 `@capacitor-community/secure-storage`
 * （Keychain / EncryptedSharedPreferences），但当前网络无法安装该 scope
 * （registry 404）。可安装时只需替换下面的 `backendGet/Set/Remove` 三个方法，
 * 加密层与上层契约不变。
 *
 * 在这之前，加了一层 **AES-GCM 加密**（渐进增强）：`crypto.subtle` 不可用
 * （非安全上下文等）时自动退回明文，绝不因此丢令牌。数据密钥为每设备随机
 * 生成的 AES-256 密钥，与密文存在同一后端 —— 能挡住「备份文件 / 偏好文件
 * 被直接读取看到明文 token」这类场景，但挡不住能同时拿到密钥的攻击者。
 * 这是当前约束下的 proportionate 方案，不是 Keychain 的等价物。
 */

const TOKEN_ITEM = 'auth.token.v2';
const KEY_ITEM = 'auth.token.key.v2';

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

export class SecureTokenStore implements TokenStore {
  /** 内存兜底：后端整体不可用（隐私模式等）时，至少一个页面会话内可用 */
  private memory: AuthToken | null = null;

  async save(token: AuthToken): Promise<void> {
    this.memory = token;
    const json = JSON.stringify(token);

    let payload: string;
    const key = await this.dataKey();
    if (key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(json);
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
      payload = JSON.stringify({
        v: 1,
        alg: 'AES-GCM',
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(cipher)),
      } satisfies EncryptedEnvelope);
    } else {
      payload = JSON.stringify({ v: 1, alg: 'plain', data: json } satisfies EncryptedEnvelope);
    }

    await this.backendSet(TOKEN_ITEM, payload);
  }

  async load(): Promise<AuthToken | null> {
    let raw: string | null = null;
    try {
      raw = await this.backendGet(TOKEN_ITEM);
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

    // 旧版（v1）存的是裸 token JSON，无信封 —— 照认，下次 save 时自动升级成加密信封
    if (!isEnvelope(parsed)) {
      const legacy = parsed as AuthToken;
      this.memory = legacy;
      return legacy;
    }

    if (parsed.alg === 'plain') {
      try {
        const token = JSON.parse(parsed.data) as AuthToken;
        this.memory = token;
        return token;
      } catch {
        return this.memory;
      }
    }

    // AES-GCM：解密失败（密钥丢失 / 数据损坏）→ 视为无令牌，走重新登录
    try {
      const key = await this.dataKey();
      if (!key || !parsed.iv) return this.memory;
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(parsed.iv) },
        key,
        base64ToBytes(parsed.data),
      );
      const token = JSON.parse(new TextDecoder().decode(plain)) as AuthToken;
      this.memory = token;
      return token;
    } catch {
      return this.memory;
    }
  }

  async clear(): Promise<void> {
    this.memory = null;
    // 令牌与数据密钥一并清除：登出即抹掉全部鉴权材料，
    // 下次登录会生成新密钥（旧密文即使被 recover 也无法解密）
    try {
      await this.backendRemove(TOKEN_ITEM);
      await this.backendRemove(KEY_ITEM);
    } catch {
      // 忽略：内存已清
    }
  }

  /** 取（或生成）本设备的数据加密密钥；`crypto.subtle` 不可用时返回 null（明文存储） */
  private async dataKey(): Promise<CryptoKey | null> {
    if (!hasSubtle()) return null;
    try {
      const existing = await this.backendGet(KEY_ITEM);
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
      await this.backendSet(KEY_ITEM, bytesToBase64(new Uint8Array(raw)));
      return key;
    } catch {
      // 密钥读写失败 → 退回明文，绝不让存储链路断掉
      return null;
    }
  }

  /* ---------------- 后端二选一 ---------------- */

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
