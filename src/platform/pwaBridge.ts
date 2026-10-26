import { Capacitor } from '@capacitor/core';

/**
 * PWA 注册（Service Worker）。
 *
 * 🔴 三条前置判断，缺一个都会出事：
 * 1. **原生壳里绝不注册** —— Capacitor 自己管资源与发版，SW 再缓存一层会导致
 *    「装了新版还跑旧代码」，而且这种 bug 只在「清了缓存」之后才消失，极难排查；
 * 2. **开发模式不注册** —— 会把 HMR 的请求也缓存起来，改代码不生效；
 * 3. **只在 https / localhost 注册** —— 浏览器只在安全上下文下给 SW，
 *    局域网 http 直连调试时（192.168.x.x）本来就会跳过，不用额外判断，
 *    但注册失败也必须静默：这只是「离线可用」的增强，不是启动的必要条件。
 *
 * 也就是说：真机上用 Safari 打开时（http）拿不到离线能力，
 * 但「添加到主屏幕」的图标 / 全屏 / 独立窗口这些**不依赖 SW**，照样生效。
 */
export function registerServiceWorker(): void {
  // 小工具容器无 Service Worker，且禁止 serviceWorker.register —— 直接跳过
  if (import.meta.env.VITE_MINITOOL) return;
  if (Capacitor.isNativePlatform()) return;
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // 等首屏渲染完再装，避免和首屏资源抢带宽
  const start = () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => undefined);
  };

  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
}
