/* Sabz Admin PWA service worker (SS-900 Part II).
 *
 * Caches only the public admin shell/static assets. Authenticated API data,
 * customer/order content and tokens are never cached. Navigation is
 * network-first with the cached shell as an offline fallback; hashed Vite
 * assets are cache-first. Push handlers remain data-only notifications.
 */
const CACHE = 'sabz-admin-shell-v1';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/brand/logo-64.png',
  '/favicon-32.png',
  '/pwa/icon-192.png',
  '/pwa/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match('/index.html')) ||
            (await caches.match('/')) ||
            new Response('آفلاین — اتصال اینترنت خود را بررسی کنید.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }),
    );
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/pwa/') ||
    url.pathname.startsWith('/brand/') ||
    PRECACHE.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'اعلان سبز سیستم', body: event.data.text() };
  }
  const title =
    typeof payload.title === 'string' ? payload.title : 'اعلان سبز سیستم';
  const body = typeof payload.body === 'string' ? payload.body : '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      data: {
        url:
          typeof payload.url === 'string' ? payload.url : '/notifications',
      },
      icon: '/brand/logo-64.png',
      badge: '/favicon-32.png',
      dir: 'rtl',
      lang: 'fa',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/notifications';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
