import { useEffect, useRef, useState } from 'react';

/**
 * 判定软键盘是否正在占用屏幕。
 *
 * 为什么要单独一个 hook：`useKeyboardAvoid` 是把高度差写成 CSS 变量给抽屉避让用的，
 * 这里是给「键盘弹起时该不该收起底部导航」用的，语义不同。
 *
 * ⚠️ 光看 `visualViewport` 的高度差**不够**：
 * - Chrome Android / iOS Safari 只压缩 visual viewport，`innerHeight` 不变 → 高度差能拿到键盘高度；
 * - 但 Capacitor 配了 `Keyboard.resize = 'native'`（Android 走 `adjustResize`）时，
 *   连**布局视口**一起被压缩，`innerHeight` 与 `vv.height` 同时变小 → 高度差恒为 0，
 *   键盘弹起了却检测不到。
 *
 * 所以两条判据取或：
 * 1. visual viewport 被吃掉的高度（`innerHeight - vv.height`）；
 * 2. 布局视口相比「历史最大高度」缩了多少（覆盖 `adjustResize` 场景）。
 * 再加一个「焦点确实在可编辑元素上」的前置条件 —— 否则旋转屏幕、
 * 浏览器工具栏收起这类视口变化也会被误判成键盘。
 */
const KEYBOARD_THRESHOLD = 120;

function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  /** 出现过的最大视口高度 = 无键盘时的高度，用来算布局视口被压缩了多少 */
  const maxHeight = useRef(0);

  useEffect(() => {
    const vv = window.visualViewport;

    const measure = () => {
      const height = window.innerHeight;
      if (height > maxHeight.current) maxHeight.current = height;

      const viewportInset = vv
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      const layoutShrink = maxHeight.current - height;

      setVisible(
        isEditing() && (viewportInset > KEYBOARD_THRESHOLD || layoutShrink > KEYBOARD_THRESHOLD),
      );
    };

    measure();
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    document.addEventListener('focusin', measure);
    document.addEventListener('focusout', measure);

    return () => {
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('focusin', measure);
      document.removeEventListener('focusout', measure);
    };
  }, []);

  return visible;
}
