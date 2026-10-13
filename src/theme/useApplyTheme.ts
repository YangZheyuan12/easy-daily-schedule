import { useEffect } from 'react';
import { getThemeMeta } from './themes';
import { useThemeStore } from './useThemeStore';

/**
 * 把当前主题落到 DOM 上。
 *
 * 这是**唯一**允许写 `data-theme` 的地方（UI 层职责）。
 * store 只管状态，好处是 store 可以在 node 环境里被测试。
 *
 * 首屏闪烁由 index.html 的内联脚本兜住 —— 那段脚本在 React 挂载前
 * 就先读 localStorage 把 `data-theme` 打上，所以这里多数时候是幂等的。
 */
export function useApplyTheme(): void {
  const theme = useThemeStore((s) => s.theme);
  const hydrate = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const root = document.documentElement;
    const meta = getThemeMeta(theme);

    // 仅在「真的发生了切换」时挂过渡类，避免首屏渲染也走一次动画
    if (root.dataset.theme && root.dataset.theme !== theme) {
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), 220);
    }

    root.dataset.theme = theme;
    // 让原生滚动条 / 日期选择器跟随明暗
    root.style.colorScheme = theme === 'nocturne' ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', meta.browserColor);
  }, [theme]);
}
