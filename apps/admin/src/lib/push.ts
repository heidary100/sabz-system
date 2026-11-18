import type { PushSubscriptionInput } from '@sabz/types'

/** Convert a VAPID public key from base64url to the Uint8Array API input. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('این مرورگر از اعلان مرورگری پشتیبانی نمی‌کند.')
  }
  return navigator.serviceWorker.register('/sw.js')
}

export async function currentPushEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    return null
  }
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  return sub?.endpoint ?? null
}

export async function subscribeToPush(
  publicKey: string,
): Promise<PushSubscriptionInput> {
  if (!('PushManager' in window)) {
    throw new Error('این مرورگر از اعلان مرورگری پشتیبانی نمی‌کند.')
  }
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('اجازه اعلان مرورگری داده نشد.')
    }
  }
  const reg = await registration()
  const existing = await reg.pushManager.getSubscription()
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }))
  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('اشتراک اعلان مرورگری ناقص است.')
  }
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  }
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!('serviceWorker' in navigator)) {
    return null
  }
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) {
    return null
  }
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  return endpoint
}
