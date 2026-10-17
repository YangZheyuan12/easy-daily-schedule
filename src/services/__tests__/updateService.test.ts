import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  evaluateUpdate,
  extractReleaseVersion,
  parseVersion,
} from '../updateService';

describe('parseVersion — 从字符串抠版本号', () => {
  it('纯版本串原样解析', () => {
    expect(parseVersion('1.2')).toBe('1.2');
    expect(parseVersion('0.1.0')).toBe('0.1.0');
    expect(parseVersion('v1.2.3')).toBe('1.2.3');
  });

  it('解析不到返回 null', () => {
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('extractReleaseVersion — body 优先、tag 兜底', () => {
  it('优先读 body 里的 version: 行', () => {
    expect(extractReleaseVersion('version: 1.2\n\n描述文案', 'latest')).toBe('1.2');
  });

  it('version: 行支持中文冒号与 v 前缀', () => {
    expect(extractReleaseVersion('version：v2.0.0', 'latest')).toBe('2.0.0');
  });

  it('body 没有 version 行时回退到 tag_name', () => {
    expect(extractReleaseVersion('', '1.3.0')).toBe('1.3.0');
    expect(extractReleaseVersion('', 'v1.3.0')).toBe('1.3.0');
  });

  it('两者都没有版本号时返回 null', () => {
    expect(extractReleaseVersion('', 'latest')).toBeNull();
  });
});

describe('compareVersions — 逐段比较', () => {
  it('相等返回 0', () => {
    expect(compareVersions('1.2', '1.2')).toBe(0);
  });

  it('更大返回 1，更小返回 -1', () => {
    expect(compareVersions('1.2', '1.1')).toBe(1);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
    expect(compareVersions('2.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.2.0', '1.2')).toBe(0);
  });

  it('逐段按数字比较（不是字典序）：1.10 > 1.9', () => {
    expect(compareVersions('1.10', '1.9')).toBe(1);
    expect(compareVersions('1.9', '1.10')).toBe(-1);
    expect(compareVersions('1.2', '1.10')).toBe(-1);
  });

  it('比较时同样容忍 v 前缀与缺段', () => {
    expect(compareVersions('v1.2', '1.2')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
  });
});

describe('evaluateUpdate — 汇总是否有更新', () => {
  it('有新版：hasUpdate true 且带最新版本号', () => {
    expect(evaluateUpdate('version: 1.2\n\n...', 'latest', '0.1.0')).toEqual({
      hasUpdate: true,
      latestVersion: '1.2',
    });
  });

  it('已是当前版本：hasUpdate false', () => {
    expect(evaluateUpdate('version: 1.2\n\n...', 'latest', '1.2')).toEqual({
      hasUpdate: false,
      latestVersion: '1.2',
    });
  });

  it('解析不到版本号：hasUpdate false、latestVersion null', () => {
    expect(evaluateUpdate('', 'latest', '1.2')).toEqual({
      hasUpdate: false,
      latestVersion: null,
    });
  });
});
