const CACHE_NAME = 'rehacoin-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/store.js',
  './js/blockchain.js',
  './js/app.js',
  './categories.json',
  './activities.json',
  './manifest.json'
];

// インストール: アセットをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// アクティベート: 古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// フェッチ: キャッシュ優先、フォールバックでネットワーク
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
