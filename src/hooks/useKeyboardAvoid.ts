import { useEffect } from 'react';

/**
 * 小于这个值的 offset 一律当作 0。
 *
 * 与 `useKeyboardVisible` 的 KEYBOARD_THRESHOLD 同值同语义（键盘判定阈值）：
 * 键盘弹起 / 收起是个几百毫秒的动画，`visualViewport` 与 `innerHeight` 的变化
 * **不同步**，过渡帧里会算出瞬时的小偏移（几十 px）。把这个值原样写进 CSS 变量，
 * 抽屉的 paddingBottom / maxHeight 就会跟着跳 —— 用户看到的就是「闪一下」。
 * 真键盘的高度远超这个阈值，阈值只过滤抖动，不改变避让行为。
 */
const OFFSET_THRESHOLD = 120;

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
      const raw = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const offset = raw < OFFSET_THRESHOLD ? 0 : raw;
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
