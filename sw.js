// 缓存策略：
// - 本地开发（localhost / 127.0.0.1）保持"网络优先"，改完刷新立刻能看到最新版
// - 线上（部署后）改为"缓存优先 + 后台更新"，打开时不再等网络，启动更快
const CACHE_NAME = 'my-family-cookbook-202609230517';
// 全部使用相对路径，这样部署在子目录（如 example.com/cookbook/）也能正常工作
const ASSETS = [
  './',
  'index.html',
  'app.js',
  'db.js',
  'images.js',
  'archive.js',
  'ui.js',
  'manage.js',
  'vendor/dexie.min.js',
  'vendor/jszip.min.js',
  'styles.css',
  'manifest.json',
  'icon.svg',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;

  // 本地开发：网络优先
  const isLocal = ['localhost', '127.0.0.1'].includes(self.location.hostname);
  if (isLocal) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 线上：入口页面先试网络（2 秒超时），失败就用缓存 —— 这样既能拿到新版本，弱网也不会卡住
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const fresh = await Promise.race([
          fetch(event.request),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
        ]);
        if (fresh && fresh.ok) cache.put(event.request, fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match(event.request)) || (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // 线上其余静态资源：缓存优先，命中就直接返回（不再重复下载，省流量也更快）
  // 新版本发布时 CACHE_NAME 会变，新 SW 预缓存新文件并清掉旧缓存，所以这里不需要每次后台重取
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch (e) {
        return Response.error();
      }
    })()
  );
});
