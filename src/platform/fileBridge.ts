/**
 * 文件的「落地」与「读取」。
 *
 * 这是全项目**少数允许直接碰浏览器 API** 的地方之一（另一个是
 * `capacitorBridge.ts`）。备份的纯数据逻辑在 `services/backupService.ts`，
 * 那里面一个浏览器 API 都不能有；只有真正要把字节写到磁盘 / 从磁盘读回来时，
 * 才走到这里。
 *
 * 关于原生壳：Capacitor 的 WebView 里 `<input type="file">` 是**可用的**
 * （Android / iOS 都会唤起系统文件选择器），所以导入这一侧 Web 与原生共用一套代码。
 * 导出侧现在有**两个出口**：
 * - `saveTextFile`：写进本机长期存储（Android 走本地插件 `SaveFilePlugin` 的
 *   MediaStore.Downloads）。🔴 不能用 `<a download>` —— Capacitor WebView 没有注册
 *   DownloadListener，Blob URL 点了不会落地；也不能用 Filesystem 插件的公共目录
 *   （Android 11+ scoped storage）。真机用户「导出成功却找不到文件」的根因就在这一步。
 * - `shareTextFile`：**直接把文件递出去** —— 弹系统分享面板，微信 / QQ / 邮件 /
 *   各家网盘都在里面。用户抱怨「在手机里找不到导出到哪」（2026-10-17）的答案不是
 *   再写一段说明告诉他去哪个文件夹，而是让他压根不用去找。
 * - Web / iOS：没有原生插件，退回 `<a download>`（iOS WKWebView 不保证落地，
 *   侧载本身受苹果限制；有 navigator.canShare 时先走系统分享）。
 *
 * 🔴 `saveTextFile` 返回**落点描述 + 真实文件名**而不是 void：用户抱怨过
 * 「不知道导出到哪去了」（2026-10-16 / 10-17 反复出现），调用方要把它们放进提示里。
 */
import { Capacitor } from '@capacitor/core';
import { SaveFile } from './saveFilePlugin';

/** 一次导出的结果描述 */
export interface SaveResult {
  /** 落点描述文案（给用户看的） */
  location: string;
  /** 手机里实际的文件名（可能被系统自动改名） */
  name: string;
}

/** 把一段文本存成本地文件，返回落点与真实文件名 */
export async function saveTextFile(
  filename: string,
  text: string,
  mime = 'application/json',
): Promise<SaveResult> {
  if (Capacitor.getPlatform() === 'android') {
    const outcome = await SaveFile.saveText({ filename, text, mime });
    return { location: '系统「下载」目录（用文件管理 App 就能看到）', name: outcome.name };
  }
  return downloadViaAnchor(filename, text, mime);
}

/**
 * 弹出系统分享面板把文件递出去（微信 / QQ / 网盘…）。
 *
 * 返回值里的 `shared` 说明这一步到底有没有真弹出去 —— 网页端没有原生面板，
 * 只能退化成下载，调用方据此把提示写成「已分享」还是「已下载」。
 */
export async function shareTextFile(
  filename: string,
  text: string,
  mime = 'application/json',
): Promise<{ shared: boolean; result: SaveResult }> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      const outcome = await SaveFile.shareText({ filename, text, mime });
      return {
        shared: true,
        result: { location: '系统分享面板（微信 / QQ / 网盘）', name: outcome.name },
      };
    } catch {
      // 分享失败（没有可接收文件的应用等）不能让整次导出崩掉 —— 退回写本地
      return { shared: false, result: await saveTextFile(filename, text, mime) };
    }
  }

  // Web：能用系统分享就用（Safari / Chrome 桌面端部分支持），否则下载
  if (typeof navigator !== 'undefined' && typeof File !== 'undefined') {
    try {
      const file = new File([text], filename, { type: `${mime};charset=utf-8` });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (nav.canShare?.({ files: [file] })) {
        await nav.share?.({ files: [file], title: filename });
        return { shared: true, result: { location: '系统分享面板', name: filename } };
      }
    } catch {
      // 用户取消或浏览器不支持：都退回下载
    }
  }
  return { shared: false, result: await downloadViaAnchor(filename, text, mime) };
}

/** 浏览器下载（`<a download>`） */
function downloadViaAnchor(filename: string, text: string, mime: string): SaveResult {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // 立刻 revoke 会让部分浏览器来不及取数据，放到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return { location: '浏览器下载目录', name: filename };
}

/**
 * 弹系统文件选择器读一个文件，返回**原始字节**。
 *
 * 课表 CSV 要走这一条而不是 `pickTextFile`：中文教务系统导出的 CSV 多半是 GBK，
 * 必须自己 `decodeTextBytes`（见 `textCodec.ts`），直接读成字符串会乱码。
 */
export function pickBinaryFile(accept = '.csv,.txt,text/csv,text/plain'): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      document.body.removeChild(input);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        resolve(reader.result instanceof ArrayBuffer ? reader.result : null);
      };
      reader.onerror = () => {
        cleanup();
        resolve(null);
      };
      reader.readAsArrayBuffer(file);
    });

    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    input.click();
  });
}

/**
 * 弹系统文件选择器读一个文本文件。
 * 用户取消或没选到内容时 resolve `null`（而不是 reject —— 取消是正常操作，不是错误）。
 */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    const cleanup = () => {
      document.body.removeChild(input);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        cleanup();
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => {
        cleanup();
        resolve(null);
      };
      reader.readAsText(file);
    });

    // 现代浏览器支持 cancel 事件；不支持时最多留一个隐藏 input，下一次调用会再建一个
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    input.click();
  });
}
