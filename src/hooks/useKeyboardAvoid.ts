import { useEffect } from 'react';

/**
 * 软键盘避让。
 *
 * H5 里键盘弹起会压缩 visualViewport，底部输入框经常被挡住。
 * 这里把 `visualViewport` 的高度差写成 CSS 变量，供抽屉底部留出安全间距。
 *
 * ⚠️ 迁移注意：小程序没有 visualViewport，需改用 `adjust-position`
 * 或监听 `keyboardheightchange`（见 ARCHITECTURE.md 迁移清单）。
 */
export function useKeyboardAvoid(): void {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--keyboard-offset');
    };
  }, []);
}
