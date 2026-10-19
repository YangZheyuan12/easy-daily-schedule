// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 备份导出的**平台分支**（2026-10-16 第九轮 → 2026-10-19 iOS 补齐）。
 *
 * 背景①：Capacitor WebView 没有 DownloadListener，`<a download>`（Blob URL）
 * 点击后不会落地 —— 用户看到「导出成功」却永远找不到文件。Android 因此走本地
 * 插件 SaveFile（MediaStore 写公共「下载」目录）。
 * 背景②：文件确实落在 Download 了，但用户「在手机里找不到」（2026-10-17）。
 * 所以又加了第二个出口 `shareTextFile`：弹系统分享面板，直接把文件递给微信 / QQ / 网盘。
 * 背景③（iOS，2026-10-19）：iOS 原先两条路都没有，导出等于废的。现在走官方
 * `@capacitor/filesystem`（写 App 沙盒 Documents，靠 Info.plist 的 UIFileSharingEnabled
 * 出现在「文件」App）与 `@capacitor/share`（系统面板）。
 *
 * 本文件锁的契约：
 * 1. Android → SaveFile.saveText（参数原样透传），返回**真实文件名**（系统可能改名）。
 * 2. iOS → Filesystem.writeFile 到 Documents；分享先写 Cache 再 Share.share(files)。
 * 3. 原生分享失败 → 退回写本地（不能让整次导出崩掉）。
 * 4. Web → 不碰任何原生 API，退回 `<a download>`。
 * 5. 自救快照只在 iOS 生效；读写失败一律静默成 null。
 */
const fakePlatform = vi.hoisted(() => ({ value: 'android' }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => fakePlatform.value,
    isNativePlatform: () => fakePlatform.value !== 'web',
  },
}));

const fakeSaveText = vi.hoisted(() => vi.fn());
const fakeShareText = vi.hoisted(() => vi.fn());

vi.mock('@/platform/saveFilePlugin', () => ({
  SaveFile: { saveText: fakeSaveText, shareText: fakeShareText },
}));

const fakeWriteFile = vi.hoisted(() => vi.fn());
const fakeReadFile = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: fakeWriteFile, readFile: fakeReadFile },
  Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));

const fakeShare = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/share', () => ({
  Share: { share: fakeShare },
}));

import {
  saveTextFile,
  shareTextFile,
  writeNativeSnapshot,
  readNativeSnapshot,
} from '@/platform/fileBridge';

beforeEach(() => {
  fakePlatform.value = 'android';
  fakeSaveText.mockReset();
  fakeShareText.mockReset();
  fakeWriteFile.mockReset();
  fakeReadFile.mockReset();
  fakeShare.mockReset();

  fakeSaveText.mockResolvedValue({ uri: 'content://media/downloads/1', name: 'a.json' });
  fakeShareText.mockResolvedValue({ uri: 'content://fileprovider/1', name: 'a.json' });
  fakeWriteFile.mockResolvedValue({ uri: 'file:///docs/a.json' });
  // 默认「还没有快照」：读文件 reject，桥接层要翻译成 null 而不是抛错
  fakeReadFile.mockRejectedValue(new Error('文件不存在'));
  fakeShare.mockResolvedValue({ activityType: 'com.apple.UIKit.activity.Message' });

  // jsdom 没有 URL.createObjectURL（Web 分支要用）
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake';
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('saveTextFile — 备份导出的平台分支', () => {
  it('Android：走 SaveFile 插件写公共下载目录，参数原样透传', async () => {
    const result = await saveTextFile('日程表备份-2026-10-16.json', '{"a":1}');

    expect(fakeSaveText).toHaveBeenCalledTimes(1);
    expect(fakeSaveText).toHaveBeenCalledWith({
      filename: '日程表备份-2026-10-16.json',
      text: '{"a":1}',
      mime: 'application/json',
    });
    expect(result.location).toContain('下载');
  });

  /*
    同一天第二次导出时 MediaStore 会把重名文件改成「xxx (1).json」——
    提示里必须写**系统返回的真实名字**，否则用户照名字去找，手机上根本没有那个文件。
  */
  it('Android：文件名以系统返回的真实名字为准（重名会被自动改名）', async () => {
    fakeSaveText.mockResolvedValue({
      uri: 'content://media/downloads/9',
      name: '日程表备份-2026-10-16 (1).json',
    });

    const result = await saveTextFile('日程表备份-2026-10-16.json', '{}');

    expect(result.name).toBe('日程表备份-2026-10-16 (1).json');
  });

  it('Android：mime 可覆盖', async () => {
    await saveTextFile('a.txt', 'hello', 'text/plain');
    expect(fakeSaveText).toHaveBeenCalledWith(
      expect.objectContaining({ mime: 'text/plain' }),
    );
  });

  it('Web：不碰原生插件，落点描述为浏览器下载目录', async () => {
    fakePlatform.value = 'web';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await saveTextFile('日程表备份-2026-10-16.json', '{}');

    expect(fakeSaveText).not.toHaveBeenCalled();
    expect(fakeWriteFile).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(result.location).toBe('浏览器下载目录');
    clickSpy.mockRestore();
  });

  it('Android 写入失败 → 向上抛（让 store 提示失败，不假装成功）', async () => {
    fakeSaveText.mockRejectedValue(new Error('磁盘空间不足'));

    await expect(saveTextFile('a.json', '{}')).rejects.toThrow('磁盘空间不足');
  });
});

describe('shareTextFile — 直接把备份文件递给用户', () => {
  it('Android：调 SaveFile.shareText 弹系统分享面板', async () => {
    const { shared } = await shareTextFile('日程表备份-2026-10-17.json', '{"a":1}');

    expect(shared).toBe(true);
    expect(fakeShareText).toHaveBeenCalledWith({
      filename: '日程表备份-2026-10-17.json',
      text: '{"a":1}',
      mime: 'application/json',
    });
  });

  it('Android：原生分享失败时退回写本地下载目录（不能让导出崩掉）', async () => {
    fakeShareText.mockRejectedValue(new Error('没有可接收文件的应用'));

    const { shared, result } = await shareTextFile('a.json', '{}');

    expect(shared).toBe(false);
    expect(fakeSaveText).toHaveBeenCalledTimes(1);
    expect(result.location).toContain('下载');
  });

  it('Web：不碰原生插件，退化成下载', async () => {
    fakePlatform.value = 'web';
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { shared, result } = await shareTextFile('a.json', '{}');

    expect(shared).toBe(false);
    expect(fakeShareText).not.toHaveBeenCalled();
    expect(fakeShare).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(result.location).toBe('浏览器下载目录');
    clickSpy.mockRestore();
  });
});

/*
  iOS 分支（2026-10-19）：WKWebView 没有 DownloadListener，`<a download>` 在原生壳里
  是**静默失效**的 —— 提示说「已导出」，文件却不存在。这里锁死「iOS 必须走原生 API」，
  以及它独有的落点（沙盒 Documents + UIFileSharingEnabled → 「文件」App）。
*/
describe('iOS：导出走官方 filesystem / share', () => {
  it('iOS：saveTextFile 写入 Documents，落点是「文件」App', async () => {
    fakePlatform.value = 'ios';

    const result = await saveTextFile('日程表备份-2026-10-19.json', '{"a":1}');

    expect(fakeWriteFile).toHaveBeenCalledWith({
      path: '日程表备份-2026-10-19.json',
      data: '{"a":1}',
      directory: 'DOCUMENTS',
      encoding: 'utf8',
    });
    expect(fakeSaveText).not.toHaveBeenCalled();
    expect(result.location).toContain('文件');
    expect(result.location).not.toContain('浏览器下载目录');
  });

  it('iOS：shareTextFile 先写 Cache，再调系统分享面板', async () => {
    fakePlatform.value = 'ios';

    const { shared } = await shareTextFile('a.json', '{}');

    // 分享副本放 Cache（系统可回收），不该长期占 Documents
    expect(fakeWriteFile).toHaveBeenCalledWith(
      expect.objectContaining({ directory: 'CACHE', path: 'a.json' }),
    );
    expect(fakeShare).toHaveBeenCalledWith({
      title: 'a.json',
      files: ['file:///docs/a.json'],
    });
    expect(shared).toBe(true);
  });

  it('iOS：分享失败 / 用户取消 → 退回写 Documents（文件至少还在）', async () => {
    fakePlatform.value = 'ios';
    fakeShare.mockRejectedValue(new Error('用户取消'));

    const { shared, result } = await shareTextFile('a.json', '{}');

    expect(shared).toBe(false);
    expect(fakeWriteFile).toHaveBeenLastCalledWith(
      expect.objectContaining({ directory: 'DOCUMENTS' }),
    );
    expect(result.location).toContain('文件');
  });
});

/*
  自救快照：iOS 会回收 WKWebView 站点数据，这份写在原生沙盒里的快照是没上云之前
  唯一的自救路径。契约是「只 iOS 写、失败静默 null、非 iOS 完全不碰插件」。
*/
describe('原生自救快照（仅 iOS）', () => {
  it('iOS：写到 Documents/Backups，并自动建目录', async () => {
    fakePlatform.value = 'ios';

    const name = await writeNativeSnapshot('{"app":"daily-schedule"}');

    expect(fakeWriteFile).toHaveBeenCalledWith({
      path: 'Backups/snapshot-latest.json',
      data: '{"app":"daily-schedule"}',
      directory: 'DOCUMENTS',
      encoding: 'utf8',
      recursive: true,
    });
    expect(name).toBe('Backups/snapshot-latest.json');
  });

  it('iOS：写入失败返回 null 而不是抛错（兜底失败不能打扰用户）', async () => {
    fakePlatform.value = 'ios';
    fakeWriteFile.mockRejectedValue(new Error('磁盘空间不足'));

    await expect(writeNativeSnapshot('{}')).resolves.toBeNull();
  });

  it('非 iOS 平台完全不碰插件（Android 与 Web 都返回 null）', async () => {
    fakePlatform.value = 'android';
    await expect(writeNativeSnapshot('{}')).resolves.toBeNull();
    await expect(readNativeSnapshot()).resolves.toBeNull();

    fakePlatform.value = 'web';
    await expect(writeNativeSnapshot('{}')).resolves.toBeNull();
    await expect(readNativeSnapshot()).resolves.toBeNull();

    expect(fakeWriteFile).not.toHaveBeenCalled();
    expect(fakeReadFile).not.toHaveBeenCalled();
  });

  it('iOS：读回快照文本', async () => {
    fakePlatform.value = 'ios';
    fakeReadFile.mockResolvedValue({ data: '{"app":"daily-schedule"}' });

    await expect(readNativeSnapshot()).resolves.toBe('{"app":"daily-schedule"}');
  });

  it('iOS：还没有快照时返回 null（「没有」是正常状态，不是错误）', async () => {
    fakePlatform.value = 'ios';
    fakeReadFile.mockRejectedValue(new Error('文件不存在'));

    await expect(readNativeSnapshot()).resolves.toBeNull();
  });
});
