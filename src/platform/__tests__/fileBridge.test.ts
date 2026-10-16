// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 备份导出的**平台分支**（2026-10-16 第九轮，配合「导出后找不到文件」修复）。
 *
 * 背景：Capacitor WebView 没有 DownloadListener，`<a download>`（Blob URL）
 * 点击后不会落地 —— 用户看到「导出成功」却永远找不到文件。现在 Android 走
 * 本地插件 SaveFile（MediaStore 写公共「下载」目录），Web / iOS 维持
 * `<a download>` 旧行为。
 *
 * 本文件锁的契约：
 * 1. Android → 调 SaveFile.saveText（filename/text/mime 原样透传），返回的
 *    落点描述指向「下载」目录；**不**走 a download。
 * 2. Web → 不碰原生插件，走 a download，返回浏览器下载目录描述。
 * 3. 原生写入失败 → 错误向上抛（store 的 catch 会变成失败 toast），
 *    不能静默「成功」。
 */
const fakePlatform = vi.hoisted(() => ({ value: 'android' }));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => fakePlatform.value,
    isNativePlatform: () => fakePlatform.value !== 'web',
  },
}));

const fakeSaveText = vi.hoisted(() => vi.fn());

vi.mock('@/platform/saveFilePlugin', () => ({
  SaveFile: { saveText: fakeSaveText },
}));

import { saveTextFile } from '@/platform/fileBridge';

beforeEach(() => {
  fakePlatform.value = 'android';
  fakeSaveText.mockReset();
  fakeSaveText.mockResolvedValue({ uri: 'content://media/downloads/1' });
  // jsdom 没有 URL.createObjectURL（Web 分支要用）
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake';
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('saveTextFile — 备份导出的平台分支', () => {
  it('Android：走 SaveFile 插件写公共下载目录，参数原样透传', async () => {
    const location = await saveTextFile('日程表备份-2026-10-16.json', '{"a":1}');

    expect(fakeSaveText).toHaveBeenCalledTimes(1);
    expect(fakeSaveText).toHaveBeenCalledWith({
      filename: '日程表备份-2026-10-16.json',
      text: '{"a":1}',
      mime: 'application/json',
    });
    expect(location).toContain('下载');
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

    const location = await saveTextFile('日程表备份-2026-10-16.json', '{}');

    expect(fakeSaveText).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(location).toBe('浏览器下载目录');
    clickSpy.mockRestore();
  });

  it('Android 写入失败 → 向上抛（让 store 提示失败，不假装成功）', async () => {
    fakeSaveText.mockRejectedValue(new Error('磁盘空间不足'));

    await expect(saveTextFile('a.json', '{}')).rejects.toThrow('磁盘空间不足');
  });
});
