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
 * - **iOS（2026-10-19 补齐）**：原先这里没有原生实现，导出退化成 `<a download>`，
 *   而 WKWebView 没有 DownloadListener —— 提示「已导出」但文件根本不存在，等于功能是废的。
 *   现在走官方 `@capacitor/filesystem` + `@capacitor/share`：落点是 App 沙盒 Documents
 *   （靠 `UIFileSharingEnabled` 在「文件」App 里可见），分享走系统面板。
 *   只有**网页端**还退回 `<a download>`。
 *
 *   为什么不用自研 Swift 插件：Capacitor 只把 npm 包形态的插件写进 `packageClassList`，
 *   App target 里的 Swift 文件不会被注册，`cap sync` 还会冲掉手工加的名字 ——
 *   官方插件才是能长期维护的那条路（细节见 `saveTextFile` 的 iOS 分支注释）。
 *
 * 🔴 `saveTextFile` 返回**落点描述 + 真实文件名**而不是 void：用户抱怨过
 * 「不知道导出到哪去了」（2026-10-16 / 10-17 反复出现），调用方要把它们放进提示里。
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { SaveFile } from './saveFilePlugin';

/**
 * 自救快照在 App 沙盒里的相对路径（`Documents/Backups/snapshot-latest.json`）。
 * 放在 Backups 子目录里，是为了让用户在「文件」App 里一眼分清「我导出的备份」
 * 和「App 自己留的兜底快照」。
 */
const NATIVE_SNAPSHOT_PATH = 'Backups/snapshot-latest.json';

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
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
    const outcome = await SaveFile.saveText({ filename, text, mime });
    return { location: '系统「下载」目录（用文件管理 App 就能看到）', name: outcome.name };
  }
  if (platform === 'ios') {
    /*
      iOS 没有「公共下载目录」这个概念，能长期留存的落点只有 App 沙盒的 Documents。
      单靠写文件用户照样找不到 —— 是 Info.plist 里的 `UIFileSharingEnabled` 让它出现在
      「文件」App 里（我的 iPhone → 日程表）。两个改动缺一不可。

      为什么用官方 Filesystem 而不是自研 Swift 插件：Capacitor 只把**npm 包形态**的插件
      写进 `packageClassList`（`cli/util/iosplugin.js` 只扫 node_modules 里的插件目录），
      App target 里的 Swift 文件不会被注册，`cap sync` 还会把手工加进去的名字冲掉。
      官方插件由 CLI 自动注册，这条路才经得起每次 sync。
    */
    await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    return { location: '「文件」App → 我的 iPhone → 日程表', name: filename };
  }
  return downloadViaAnchor(filename, text, mime);
}

/**
 * 本机是否支持「原生沙盒快照」。
 *
 * UI 用它决定要不要渲染「本机快照」那一块 —— 与其在每个组件里各写一次
 * `Capacitor.getPlatform() === 'ios'`，不如由平台层给出唯一答案。
 */
export function supportsNativeSnapshot(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/**
 * 把最新数据快照写进原生沙盒（**只有 iOS**）。
 *
 * 为什么只有 iOS：iOS 会回收 WKWebView 的站点数据，IndexedDB 里的记录可能整库消失，
 * 而这份快照写在原生沙盒、不随 WebView 回收 —— 它是**没有云同步之前**唯一的自救路径。
 * Android 的 WebView 不会这样被回收，且那边已有下载目录导出这条更成熟的路径，
 * 所以不做双写（真要加，给 Java 插件补同样两个方法即可，接口已经对齐）。
 *
 * 失败一律返回 `null` 而不是抛错：这是**后台兜底**，绝不能因为兜底失败打扰用户。
 *
 * @returns 落盘的文件名；非 iOS 或写入失败返回 `null`
 */
export async function writeNativeSnapshot(text: string): Promise<string | null> {
  if (Capacitor.getPlatform() !== 'ios') return null;
  try {
    await Filesystem.writeFile({
      path: NATIVE_SNAPSHOT_PATH,
      data: text,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      // 首次写入时 Backups 目录还不存在，交给插件一起建
      recursive: true,
    });
    return NATIVE_SNAPSHOT_PATH;
  } catch {
    return null;
  }
}

/**
 * 读回原生沙盒里的自救快照。
 *
 * @returns 快照文本；非 iOS / 还没有快照 / 读失败都返回 `null`（「没有快照」不是错误，
 * 而是大多数时候的正常状态 —— 首次启动必然没有）。
 */
export async function readNativeSnapshot(): Promise<string | null> {
  if (Capacitor.getPlatform() !== 'ios') return null;
  try {
    const result = await Filesystem.readFile({
      path: NATIVE_SNAPSHOT_PATH,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    // 指定了 encoding 时 data 是 string；防御性判断一下，别把 Blob 当文本用
    return typeof result.data === 'string' ? result.data : null;
  } catch {
    // 文件不存在 / 读失败 → 都当作「没有快照」，这是首次启动的正常状态
    return null;
  }
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
  const platform = Capacitor.getPlatform();
  if (platform === 'android') {
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

  if (platform === 'ios') {
    try {
      // 分享用的副本放 Cache：系统可自行回收，不该长期占着 Documents
      const { uri } = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({ title: filename, files: [uri] });
      return {
        shared: true,
        result: { location: '系统分享面板（微信 / QQ / 网盘）', name: filename },
      };
    } catch {
      // 用户取消也算「没分享出去」—— 退回落到 Documents，至少文件还在
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
