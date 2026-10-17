/**
 * 本地原生插件 `SaveFile` 的 TS 侧封装。
 *
 * 对应 `android/app/src/main/java/com/yangzheyuan/dailyschedule/SaveFilePlugin.java`。
 * 两个方法对应两个不同的用户诉求：
 * - `saveText`：把文件写进 Android 公共「下载」目录，长期留在这台设备上。
 * - `shareText`：写成临时文件后弹**系统分享面板**（微信 / QQ / 邮件 / 网盘）。
 *
 * 为什么不用 Filesystem 插件：`Directory.ExternalStorage` 在 Android 11+ 被
 * scoped storage 挡住，`Directory.Documents` 在 Android 11+ 只能访问 App 自建
 * 的文件；而 Capacitor WebView 没有 DownloadListener，`<a download>`（Blob URL）
 * 点击后不会落地 —— 用户看到「导出成功」却找不到文件（2026-10-16 用户报告）。
 *
 * 为什么不用官方 @capacitor/share：它的 Android 实现只接受 `file://` 路径，
 * 而 API 29+ 我们从 MediaStore 拿到的是 `content://` Uri，传进去会被直接 reject。
 */
import { registerPlugin } from '@capacitor/core';

/** 一次落盘 / 分享的结果 */
export interface SaveOutcome {
  /** 文件的 content / file Uri */
  uri: string;
  /**
   * **真实**文件名。同一天重复导出时系统会为重名文件改名（「xxx (1).json」），
   * 提示文案必须用它而不是我们传进去的那个，否则用户按名字找不到文件。
   */
  name: string;
}

export interface SaveFilePlugin {
  /** 写一个文本文件到公共下载目录 */
  saveText(options: {
    filename: string;
    text: string;
    mime?: string;
  }): Promise<SaveOutcome>;
  /** 写一个临时文件并弹系统分享面板（发给微信 / QQ / 存到网盘） */
  shareText(options: {
    filename: string;
    text: string;
    mime?: string;
  }): Promise<SaveOutcome>;
}

const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile');

export { SaveFile };
