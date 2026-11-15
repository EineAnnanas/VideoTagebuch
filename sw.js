const CACHE_NAME = 'tagebuch-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/favicon.ico',
  './icons/favicon-96x96.png',
  './icons/favicon-192x192.png',
  './icons/favicon-512x512.png',
  './icons/apple-touch-icon.png'
];

// 1. Install: pre-cache app shell & activate immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 2. Activate: clean up old caches and take control of open tabs
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 3. Fetch: only intercept safe same-origin GET requests
self.addEventListener('fetch', (e) => {
  // Ignore POST/PUT/DELETE (Google Drive uploads, /api/subscribe, etc.)
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Ignore cross-origin requests (Google APIs, OAuth, Raspberry Pi backend)
  if (url.origin !== self.location.origin) return;

  // Never intercept or cache OAuth redirect callbacks
  if (
    url.searchParams.has('code') ||
    url.searchParams.has('state') ||
    url.searchParams.has('error')
  ) return;

  const isHtml =
    e.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('.html');

  if (isHtml) {
    // Network-First for index.html: always fetch latest updates, fall back to cache offline
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Stale-While-Revalidate for local static files (icons, manifest)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});

// 4. Push notifications
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Video Tagebuch Erinnerung';
  const options = {
    body: data.body || 'Zeit für deinen täglichen Tagebucheintrag!',
    icon: 'icons/favicon-192x192.png',
    badge: 'icons/favicon-96x96.png',
    data: { url: './' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 5. Notification click: focus open PWA window or open a new one
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
