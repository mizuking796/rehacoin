const CACHE_NAME = 'rehacoin-v53';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/i18n.js',
  './js/api.js',
  './js/data.js',
  './js/store.js',
  './js/app.js',
  './categories.json',
  './activities.json',
  './manifest.json',
  './privacy.html',
  './img/coin.svg'
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

// プッシュ通知受信
self.addEventListener('push', event => {
  let data = { title: 'リハコイン', body: '新しい通知があります' };
  if (event.data) {
    try { data = event.data.json(); }
    catch { data.body = event.data.text(); }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'リハコイン', {
      body: data.body || '',
      icon: './img/coin.svg',
      badge: './img/coin.svg',
      data: data.url || './'
    })
  );
});

// 通知クリック: アプリを開く
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('rehacoin') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(event.notification.data || './');
    })
  );
});
