const CACHE_NAME = 'tagebuch-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/favicon.svg',
  './icons/favicon-96x96.png',
  './icons/favicon-192x192.png',
  './icons/favicon-512x512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});

// Push notification displaying your 192x192 icon
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Video Tagebuch Erinnerung';
  const options = {
    body: data.body || 'Zeit für deinen Video Beitrag!',
    icon: 'icons/favicon-192x192.png',
    badge: 'icons/favicon-96x96.png',
    data: { url: './' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data.url));
});
