// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 主题落地冒烟：确认 store 一变，`<html data-theme>` 与 meta theme-color 就跟变。
 *
 * 这条链路是三主题切换的最后一公里 —— tailwind 配置、CSS 变量都写对了，
 * 但没人写 `data-theme` 的话界面永远停在默认主题，而这类问题单测 components
 * 层是发现不了的，所以在这里单独盯住。
 */

const { store } = vi.hoisted(() => ({ store: { set: vi.fn() } }));

vi.mock('@/store/bootstrap', () => ({
  repos: {
    settings: {
      get: vi.fn().mockResolvedValue('paper'),
      // 必须返回 Promise：store 里对写入做了 .catch 保护
      set: (key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      },
    },
  },
}));

const { useThemeStore } = await import('@/theme/useThemeStore');
const { useApplyTheme } = await import('@/theme/useApplyTheme');

// React 18 要求显式声明，否则 act() 会告警
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function Host() {
  useApplyTheme();
  return null;
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  document.head.appendChild(meta);

  useThemeStore.setState({ theme: 'paper', hydrated: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useApplyTheme', () => {
  it('挂载后把默认主题写到 <html data-theme>', async () => {
    await act(async () => {
      root.render(createElement(Host));
    });
    expect(document.documentElement.dataset.theme).toBe('paper');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#FBF8F2');
  });

  it('切换主题 → data-theme 与 meta 同步更新', async () => {
    await act(async () => {
      root.render(createElement(Host));
    });

    await act(async () => {
      useThemeStore.getState().setTheme('nocturne');
    });
    expect(document.documentElement.dataset.theme).toBe('nocturne');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#0B0E14');
    // 深色主题要显式告诉浏览器，否则原生滚动条 / 日期选择器还是浅色
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await act(async () => {
      useThemeStore.getState().setTheme('plain');
    });
    expect(document.documentElement.dataset.theme).toBe('plain');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('切换会持久化，刷新后还是用户选的那套', async () => {
    await act(async () => {
      root.render(createElement(Host));
    });
    await act(async () => {
      useThemeStore.getState().setTheme('nocturne');
    });
    expect(store.set).toHaveBeenCalledWith('theme', 'nocturne');
  });
});
