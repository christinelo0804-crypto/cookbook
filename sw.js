// 网络优先：只要在线就总是拿最新文件，离线时才回退到缓存。
const CACHE_NAME = 'my-family-cookbook-202609220501';
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

  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
