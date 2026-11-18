import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  NotificationDto,
  NotificationPreferenceDto,
  PushConfigResponse,
} from '@sabz/types'
import type { Socket } from 'socket.io-client'
import { useAuth } from '../../auth/auth-provider'
import { connectRealtime } from '../../lib/realtime'
import {
  playNotificationSound,
  unlockNotificationSound,
} from '../../lib/notification-sound'
import {
  currentPushEndpoint,
  subscribeToPush,
  unsubscribeFromPush,
} from '../../lib/push'
import { translateApiError } from '../../lib/error-messages'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationPreferences,
  pushConfig as fetchPushConfig,
  subscribePush,
  unreadNotificationCount,
  unsubscribePush,
  updateNotificationPreferences,
} from '../../services/notifications'

export interface NotificationToast {
  id: string
  notification: NotificationDto
}

interface NotificationCenterValue {
  items: NotificationDto[]
  unread: number
  loading: boolean
  error: string | null
  connected: boolean
  preferences: NotificationPreferenceDto
  pushConfig: PushConfigResponse | null
  pushBusy: boolean
  preferenceError: string | null
  toasts: NotificationToast[]
  /** Increments on any chat socket event, so the inbox can reconcile. */
  chatVersion: number
  refresh: () => Promise<void>
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  setSoundEnabled: (enabled: boolean) => Promise<void>
  setBrowserPushEnabled: (enabled: boolean) => Promise<void>
  dismissToast: (id: string) => void
  playTestSound: () => void
}

const NotificationCenterContext =
  createContext<NotificationCenterValue | undefined>(undefined)

const MAX_ITEMS = 40
const MAX_TOASTS = 3
const TOAST_MS = 7_000

export function NotificationCenterProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const [items, setItems] = useState<NotificationDto[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [preferences, setPreferences] = useState<NotificationPreferenceDto>({
    soundEnabled: true,
    browserPushEnabled: false,
  })
  const [pushConfig, setPushConfig] = useState<PushConfigResponse | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  const [preferenceError, setPreferenceError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<NotificationToast[]>([])
  const [chatVersion, setChatVersion] = useState(0)
  const seen = useRef(new Set<string>())
  const prefsRef = useRef(preferences)
  const toastTimers = useRef(new Map<string, number>())
  const socketRef = useRef<Socket | null>(null)

  prefsRef.current = preferences

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = toastTimers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      toastTimers.current.delete(id)
    }
  }, [])

  const pushToast = useCallback(
    (notification: NotificationDto) => {
      setToasts((current) => {
        const next = [
          { id: notification.id, notification },
          ...current.filter((toast) => toast.id !== notification.id),
        ].slice(0, MAX_TOASTS)
        return next
      })
      const existing = toastTimers.current.get(notification.id)
      if (existing !== undefined) {
        window.clearTimeout(existing)
      }
      toastTimers.current.set(
        notification.id,
        window.setTimeout(() => dismissToast(notification.id), TOAST_MS),
      )
    },
    [dismissToast],
  )

  const refresh = useCallback(async () => {
    if (status !== 'authenticated') {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [list, count, prefs, push] = await Promise.all([
        listNotifications({ page: 1, limit: 30 }),
        unreadNotificationCount(),
        notificationPreferences(),
        fetchPushConfig(),
      ])
      for (const item of list.items) {
        seen.current.add(item.id)
      }
      setItems(list.items)
      setUnread(count.unread)
      setPreferences(prefs)
      setPushConfig(push)
    } catch (loadError) {
      setError(translateApiError(loadError))
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') {
      setItems([])
      setUnread(0)
      setConnected(false)
      return
    }
    void refresh()
  }, [status, refresh])

  useEffect(() => {
    if (status !== 'authenticated') {
      return
    }
    const socket = connectRealtime()
    socketRef.current = socket

    const onNew = (payload: { notification: NotificationDto; unread: number }) => {
      const notification = payload.notification
      if (!notification || seen.current.has(notification.id)) {
        setUnread(payload.unread)
        return
      }
      seen.current.add(notification.id)
      setItems((current) => [notification, ...current].slice(0, MAX_ITEMS))
      setUnread(payload.unread)
      pushToast(notification)
      if (prefsRef.current.soundEnabled) {
        playNotificationSound()
      }
    }
    const onRead = (payload: { id: string; unread: number }) => {
      setItems((current) =>
        current.map((item) =>
          item.id === payload.id && item.readAt === null
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      )
      setUnread(payload.unread)
    }
    const onUnread = (payload: { unread: number }) => {
      setUnread(payload.unread)
    }
    const onConnect = () => {
      setConnected(true)
      // Reconcile anything missed while the socket was offline.
      void refresh()
    }
    const onDisconnect = () => setConnected(false)
    const onAuthError = () => setConnected(false)
    const onChat = () => setChatVersion((value) => value + 1)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('notification:new', onNew)
    socket.on('notification:read', onRead)
    socket.on('notification:unread', onUnread)
    socket.on('auth:error', onAuthError)
    socket.on('chat:message', onChat)
    socket.on('chat:read', onChat)
    socket.on('chat:closed', onChat)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    const onInteraction = () => unlockNotificationSound()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pointerdown', onInteraction, { once: true })
    window.addEventListener('keydown', onInteraction, { once: true })

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('notification:new', onNew)
      socket.off('notification:read', onRead)
      socket.off('notification:unread', onUnread)
      socket.off('auth:error', onAuthError)
      socket.off('chat:message', onChat)
      socket.off('chat:read', onChat)
      socket.off('chat:closed', onChat)
      socket.disconnect()
      socketRef.current = null
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pointerdown', onInteraction)
      window.removeEventListener('keydown', onInteraction)
    }
  }, [status, refresh, pushToast])

  useEffect(() => {
    const timers = toastTimers.current
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }
  }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id)
      setItems((current) =>
        current.map((item) =>
          item.id === id && item.readAt === null
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      )
      setUnread((current) => Math.max(0, current - 1))
    } catch {
      // The next reconcile will correct any optimistic drift.
      await refresh()
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead()
      const now = new Date().toISOString()
      setItems((current) =>
        current.map((item) => (item.readAt === null ? { ...item, readAt: now } : item)),
      )
      setUnread(0)
    } catch {
      await refresh()
    }
  }, [refresh])

  const setSoundEnabled = useCallback(async (enabled: boolean) => {
    setPreferenceError(null)
    try {
      const updated = await updateNotificationPreferences({ soundEnabled: enabled })
      setPreferences(updated)
      if (enabled) {
        unlockNotificationSound()
        playNotificationSound()
      }
    } catch (saveError) {
      setPreferenceError(translateApiError(saveError))
    }
  }, [])

  const setBrowserPushEnabled = useCallback(
    async (enabled: boolean) => {
      setPushBusy(true)
      setPreferenceError(null)
      try {
        if (enabled) {
          if (!pushConfig?.enabled || !pushConfig.publicKey) {
            throw new Error('اعلان مرورگری در این سرور پیکربندی نشده است.')
          }
          const subscription = await subscribeToPush(pushConfig.publicKey)
          await subscribePush(subscription)
          const updated = await updateNotificationPreferences({
            browserPushEnabled: true,
          })
          setPreferences(updated)
        } else {
          const endpoint =
            (await currentPushEndpoint()) ??
            (await unsubscribeFromPush())
          if (endpoint) {
            await unsubscribePush(endpoint)
          }
          const updated = await updateNotificationPreferences({
            browserPushEnabled: false,
          })
          setPreferences(updated)
        }
      } catch (saveError) {
        setPreferenceError(
          saveError instanceof Error
            ? saveError.message
            : translateApiError(saveError),
        )
      } finally {
        setPushBusy(false)
      }
    },
    [pushConfig],
  )

  const value = useMemo<NotificationCenterValue>(
    () => ({
      items,
      unread,
      loading,
      error,
      connected,
      preferences,
      pushConfig,
      pushBusy,
      preferenceError,
      toasts,
      chatVersion,
      refresh,
      markRead,
      markAllRead,
      setSoundEnabled,
      setBrowserPushEnabled,
      dismissToast,
      playTestSound: playNotificationSound,
    }),
    [
      items,
      unread,
      loading,
      error,
      connected,
      preferences,
      pushConfig,
      pushBusy,
      preferenceError,
      toasts,
      chatVersion,
      refresh,
      markRead,
      markAllRead,
      setSoundEnabled,
      setBrowserPushEnabled,
      dismissToast,
    ],
  )

  return (
    <NotificationCenterContext.Provider value={value}>
      {children}
    </NotificationCenterContext.Provider>
  )
}

export function useNotificationCenter(): NotificationCenterValue {
  const value = useContext(NotificationCenterContext)
  if (!value) {
    throw new Error('useNotificationCenter must be used inside its provider')
  }
  return value
}
