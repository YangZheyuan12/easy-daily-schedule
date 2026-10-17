// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 备份导出的**平台分支**（2026-10-16 第九轮 + 2026-10-17 第十轮）。
 *
 * 背景①：Capacitor WebView 没有 DownloadListener，`<a download>`（Blob URL）
 * 点击后不会落地 —— 用户看到「导出成功」却永远找不到文件。Android 因此走本地
 * 插件 SaveFile（MediaStore 写公共「下载」目录）。
 * 背景②：文件确实落在 Download 了，但用户「在手机里找不到」（2026-10-17）。
 * 所以又加了第二个出口 `shareTextFile`：弹系统分享面板，直接把文件递给微信 / QQ / 网盘。
 *
 * 本文件锁的契约：
 * 1. Android → 调 SaveFile.saveText（filename/text/mime 原样透传），返回**真实文件名**
 *    （系统可能为重名文件改名），且**不**走 a download。
 * 2. `shareTextFile` 在 Android 上调 SaveFile.shareText；原生失败时退回写本地。
 * 3. Web → 不碰原生插件，走 a download，返回浏览器下载目录描述。
 * 4. 写入失败 → 错误向上抛（store 的 catch 会变成失败 toast），不能静默「成功」。
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

import { saveTextFile, shareTextFile } from '@/platform/fileBridge';

beforeEach(() => {
  fakePlatform.value = 'android';
  fakeSaveText.mockReset();
  fakeShareText.mockReset();
  fakeSaveText.mockResolvedValue({ uri: 'content://media/downloads/1', name: 'a.json' });
  fakeShareText.mockResolvedValue({ uri: 'content://fileprovider/1', name: 'a.json' });
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
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(result.location).toBe('浏览器下载目录');
    clickSpy.mockRestore();
  });
});
