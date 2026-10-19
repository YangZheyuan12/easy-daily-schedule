/**
 * Service Worker（**只在浏览器里注册**，原生壳永远不会加载它）。
 *
 * 为什么原生壳里不能用：Capacitor 自己管资源加载与发版，SW 再缓存一层，
 * 结果就是「装了新版还跑旧代码」，而且排查起来极难（清缓存才能复现/消失）。
 * 所以注册入口 `platform/pwaBridge.ts` 里第一条判断就是 `isNativePlatform()`。
 *
 * 缓存策略（刻意不对称）：
 * - **导航请求用 network-first**：先走网络，成功就更新缓存。这样发版后第一次打开
 *   拿到的就是新 index.html，它引用的新 hash 资源自然也会重新拉取 ——
 *   **不需要维护缓存版本号**，也就不会出现「缓存名写死了忘改」的经典事故。
 *   网络失败才回退到缓存，这是离线可用的那一半。
 * - **静态资源用 stale-while-revalidate**：先给缓存（秒开），同时在后台更新。
 *   资源文件名带内容 hash，同名即同内容，不存在「缓存了旧内容」的问题。
 */
const CACHE = 'ds-runtime-v1';
const SHELL = 'index.html';

self.addEventListener('install', (event) => {
  // 不等旧 SW 退出：装完立刻接管，避免「关掉再开才生效」的困惑
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE);
    const cached = (await cache.match(request)) ?? (await cache.match(SHELL));
    if (cached) return cached;
    return new Response('离线且没有缓存', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}
