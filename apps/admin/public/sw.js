/* Sabz admin push service worker (SS-900). Data-only payloads; no caching. */
self.addEventListener('push', (event) => {
  if (!event.data) return
  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'اعلان سبز سیستم', body: event.data.text() }
  }
  const title = typeof payload.title === 'string' ? payload.title : 'اعلان سبز سیستم'
  const body = typeof payload.body === 'string' ? payload.body : ''
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      data: { url: typeof payload.url === 'string' ? payload.url : '/notifications' },
      dir: 'rtl',
      lang: 'fa',
      badge: undefined,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/notifications'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
