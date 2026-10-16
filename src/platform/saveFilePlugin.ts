/**
 * 本地原生插件 `SaveFile` 的 TS 侧封装。
 *
 * 对应 `android/app/src/main/java/com/yangzheyuan/dailyschedule/SaveFilePlugin.java`：
 * 把一段文本写进 Android 公共「下载」目录（MediaStore，API 29+ 免权限）。
 *
 * 为什么不用 Filesystem 插件：`Directory.ExternalStorage` 在 Android 11+ 被
 * scoped storage 挡住，`Directory.Documents` 在 Android 11+ 只能访问 App 自建
 * 的文件；而 Capacitor WebView 没有 DownloadListener，`<a download>`（Blob URL）
 * 点击后不会落地 —— 用户看到「导出成功」却找不到文件（2026-10-16 用户报告）。
 */
import { registerPlugin } from '@capacitor/core';

export interface SaveFilePlugin {
  /** 写一个文本文件到公共下载目录，返回文件的 uri */
  saveText(options: {
    filename: string;
    text: string;
    mime?: string;
  }): Promise<{ uri: string }>;
}

const SaveFile = registerPlugin<SaveFilePlugin>('SaveFile');

export { SaveFile };
