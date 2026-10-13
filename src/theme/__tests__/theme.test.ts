import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  getThemeMeta,
  normalizeTheme,
  type ThemeId,
} from '@/theme/themes';
import { useThemeStore } from '@/theme/useThemeStore';

describe('themes · 元数据', () => {
  it('默认主题是 C 纸感暖白（主方案）', () => {
    expect(DEFAULT_THEME).toBe('paper');
  });

  it('三套主题的 id 唯一且都有合法 hex 色板', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['paper', 'plain', 'nocturne']);

    for (const t of THEMES) {
      for (const hex of [t.swatch.app, t.swatch.surface, t.swatch.accent, t.browserColor]) {
        expect(hex, `${t.id} 的色值 ${hex}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('三套主题的圆角尺度互不相同 —— 差异不能只停留在配色上', () => {
    const radii = THEMES.map((t) => t.radius);
    expect(new Set(radii).size).toBe(radii.length);
  });

  it('getThemeMeta 总能拿到一个对象', () => {
    expect(getThemeMeta('nocturne').label).toBe('夜航微光');
    // 即使传入非法值（运行时不该发生，但别让它炸）
    expect(getThemeMeta('nope' as ThemeId).id).toBe(DEFAULT_THEME);
  });

  it('存储 key 保持稳定 —— index.html 的防闪烁脚本硬编码了它', () => {
    expect(THEME_STORAGE_KEY).toBe('theme');
  });
});

describe('normalizeTheme', () => {
  it('合法值原样返回', () => {
    expect(normalizeTheme('paper')).toBe('paper');
    expect(normalizeTheme('plain')).toBe('plain');
    expect(normalizeTheme('nocturne')).toBe('nocturne');
  });

  it('脏值 / 旧版本值一律退回默认主题，而不是崩掉', () => {
    for (const bad of [undefined, null, 42, {}, [], 'Paper', 'dark', '']) {
      expect(normalizeTheme(bad)).toBe(DEFAULT_THEME);
    }
  });
});

describe('useThemeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: DEFAULT_THEME, hydrated: false });
  });

  it('初始为默认主题', () => {
    expect(useThemeStore.getState().theme).toBe('paper');
    expect(useThemeStore.getState().hydrated).toBe(false);
  });

  it('setTheme 立即生效（不等持久化回来）', () => {
    useThemeStore.getState().setTheme('nocturne');
    expect(useThemeStore.getState().theme).toBe('nocturne');
  });

  it('重复设置同一个主题不产生新状态', () => {
    useThemeStore.getState().setTheme('plain');
    const first = useThemeStore.getState();
    useThemeStore.getState().setTheme('plain');
    expect(useThemeStore.getState()).toBe(first);
  });

  it('hydrate 后读到的是合法主题（node 环境无 localStorage 时退默认值）', async () => {
    await useThemeStore.getState().hydrate();
    const { theme, hydrated } = useThemeStore.getState();
    expect(hydrated).toBe(true);
    expect(['paper', 'plain', 'nocturne']).toContain(theme);
  });

  it('hydrate 幂等：第二次调用不覆盖用户已经切换过的主题', async () => {
    await useThemeStore.getState().hydrate();
    useThemeStore.getState().setTheme('nocturne');
    await useThemeStore.getState().hydrate();
    expect(useThemeStore.getState().theme).toBe('nocturne');
  });
});
