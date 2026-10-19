/**
 * 键盘高度的读取口径 —— 两个键盘 hook 共用，避免各解各的。
 *
 * 数据来源是 CSS 变量 `--keyboard-native-height`，由 `platform/capacitorBridge.ts`
 * 在 **iOS** 的 `keyboardDidShow` 事件里写入（值来自原生，单位 px）。
 *
 * 为什么不让 hook 自己调 `@capacitor/keyboard`：
 * `@capacitor/*` 不能在会被 vitest 加载的模块里出现（见 `capacitorBridge.ts` 顶部注释），
 * 而 hooks 是组件层直接引用的。用 CSS 变量传递，两边解耦，测试环境天然读到 0。
 *
 * 网页端 / Android 上这个变量不存在，一律返回 0，调用方回退到各自的测量逻辑 ——
 * 所以 Android 已经验证过的行为不会因为这次改动发生变化。
 */
export function nativeKeyboardHeight(): number {
  if (typeof document === 'undefined') return 0;

  const value = Number.parseFloat(
    document.documentElement.style.getPropertyValue('--keyboard-native-height'),
  );

  // NaN / 负数 / 缺省都按「没有原生高度」处理
  return Number.isFinite(value) && value > 0 ? value : 0;
}
