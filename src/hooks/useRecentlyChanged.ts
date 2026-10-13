import { useEffect, useRef, useState } from 'react';

/** 默认的「余韵」时长，略长于动效本身（勾选弹一下 280ms） */
const DEFAULT_HOLD_MS = 420;

/**
 * 「刚刚变化过」开关 —— 用来让微动效**只在状态真的变了那一刻**播放。
 *
 * 为什么需要它：动效的常规写法是
 * `className={done ? 'm-tick' : ''}`，但 CSS animation 在元素**首次挂载**时也会跑。
 * 于是打开页面时，所有已完成的条目会集体弹一下，用户看到的是「页面在抖」，
 * 而不是「我刚勾了这一条」—— 动效给错了对象，比没有动效更糟。
 *
 * 这个 hook 只在挂载后的**后续变化**上返回 true，并在 `holdMs` 后复位：
 * - 首次渲染（含 StrictMode 的双次挂载）→ false
 * - 值不变的重渲染（每次输入、主题切换）→ false，不会反复触发
 * - 值真的变了 → true，持续 holdMs
 *
 * 与 `useAutoResizeTextarea` 等一样属于 UI 层，不碰存储。
 */
export function useRecentlyChanged<T>(value: T, holdMs = DEFAULT_HOLD_MS): boolean {
  const previous = useRef(value);
  const mounted = useRef(false);
  const [hit, setHit] = useState(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      return;
    }
    if (Object.is(previous.current, value)) return;
    previous.current = value;

    setHit(true);
    const timer = setTimeout(() => setHit(false), holdMs);
    return () => clearTimeout(timer);
  }, [value, holdMs]);

  return hit;
}
