const CACHE_NAME = 'tagebuch-cache-v4';

// The page keeps downloaded videos in its own cache. It must survive
// service worker updates, otherwise every deploy re-downloads everything.
const SEITEN_CACHE = 'videotagebuch-dateien';

// How long the network may take for the HTML before the cached copy is
// served. The fresh copy still lands in the cache for the next launch.
const HTML_ZEITLIMIT_MS = 3000;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/favicon.svg',
  './assets/icons/favicon.ico',
  './assets/icons/favicon-96x96.png',
  './assets/icons/favicon-192x192.png',
  './assets/icons/favicon-512x512.png',
  './assets/icons/apple-touch-icon.png'
];

// 1. Install: pre-cache app shell & activate immediately
self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Cache each file individually: with cache.addAll() a single missing file
  // (e.g. after moving icons) rejects the whole install, the service worker
  // never activates and navigator.serviceWorker.ready never resolves – which
  // silently breaks push subscriptions for every new visitor.
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(
      ASSETS.map((asset) => cache.add(asset).catch((err) => {
        console.warn('[sw] Konnte nicht cachen:', asset, err);
      }))
    ))
  );
});

// 2. Activate: clean up old caches and take control of open tabs
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== SEITEN_CACHE
            && key.startsWith('tagebuch-cache-'))
          .map((key) => caches.delete(key))
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
    // Network-first for index.html, but with a time limit: on a slow
    // mobile connection the cached copy is served after HTML_ZEITLIMIT_MS.
    // The network request keeps running and updates the cache, so the
    // new version is used on the next launch.
    const ausCache = () => caches.match(e.request)
      .then((res) => res || caches.match('./index.html'));

    const vomNetz = fetch(e.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
      }
      return res;
    });

    const zeitlimit = new Promise((resolve) => {
      setTimeout(() => ausCache().then((res) => { if (res) resolve(res); }), HTML_ZEITLIMIT_MS);
    });

    e.respondWith(
      Promise.race([vomNetz, zeitlimit])
        .catch(() => ausCache())
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
  // Never let a malformed payload prevent showNotification(): Safari revokes
  // the push permission if a push event does not display a notification.
  let data = {};
  if (e.data) {
    try { data = e.data.json(); }
    catch (err) { data = { body: e.data.text() }; }
  }
  const title = data.title || 'Video Tagebuch Erinnerung';
  const options = {
    body: data.body || 'Neuigkeiten im Video Tagebuch',
    icon: 'assets/icons/favicon-192x192.png',
    badge: 'assets/icons/favicon-96x96.png',
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
