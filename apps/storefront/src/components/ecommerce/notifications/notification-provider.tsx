'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import type { NotificationDto } from '@sabz/types';
import type { Socket } from 'socket.io-client';
import { useHasSession } from '@/components/ecommerce/wishlist/use-has-session';
import { connectRealtime } from '@/lib/realtime';
import {
  playNotificationSound,
  unlockNotificationSound,
} from '@/lib/notification-sound';
import {
  currentPushEndpoint,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push';
import {
  fetchNotificationPreferences,
  fetchNotifications,
  fetchPushConfig,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  subscribePush,
  unsubscribePush,
  updateNotificationPreferences,
} from '@/lib/notifications';
import { formatFaNumber } from '@/lib/format';
import { ApiError } from '@/lib/api';

export interface StoreToast {
  id: string;
  notification: NotificationDto;
}

interface StoreNotificationValue {
  items: NotificationDto[];
  unread: number;
  connected: boolean;
  preferences: { soundEnabled: boolean; browserPushEnabled: boolean };
  pushConfig: { enabled: boolean; publicKey: string | null } | null;
  pushBusy: boolean;
  toasts: StoreToast[];
  chatVersion: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  setSoundEnabled: (enabled: boolean) => Promise<void>;
  setBrowserPushEnabled: (enabled: boolean) => Promise<void>;
  dismissToast: (id: string) => void;
  playTestSound: () => void;
  error: string | null;
}

const StoreNotificationContext = createContext<StoreNotificationValue | undefined>(
  undefined,
);

const TOAST_MS = 7_000;

function entityHref(item: NotificationDto): string | null {
  if (!item.entity || !item.entityId) return null;
  switch (item.entity) {
    case 'Order':
      return `/orders/${item.entityId}`;
    case 'ReturnRequest':
      return `/returns/${item.entityId}`;
    case 'Rfq':
      return `/rfq/${item.entityId}`;
    default:
      return null;
  }
}

export function StoreNotificationProvider({ children }: { children: ReactNode }) {
  const visible = useHasSession();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);
  const [preferences, setPreferences] = useState({
    soundEnabled: true,
    browserPushEnabled: false,
  });
  const [pushConfig, setPushConfig] = useState<{
    enabled: boolean;
    publicKey: string | null;
  } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [toasts, setToasts] = useState<StoreToast[]>([]);
  const [chatVersion, setChatVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const prefsRef = useRef(preferences);
  const seen = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    prefsRef.current = preferences;
  }, [preferences]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (notification: NotificationDto) => {
      setToasts((current) =>
        [
          { id: notification.id, notification },
          ...current.filter((toast) => toast.id !== notification.id),
        ].slice(0, 3),
      );
      const existing = timers.current.get(notification.id);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.current.set(
        notification.id,
        window.setTimeout(() => dismissToast(notification.id), TOAST_MS),
      );
    },
    [dismissToast],
  );

  const refresh = useCallback(async () => {
    if (!visible) return;
    setError(null);
    try {
      const [list, count, prefs, push] = await Promise.all([
        fetchNotifications(false),
        fetchUnreadCount(),
        fetchNotificationPreferences(),
        fetchPushConfig(),
      ]);
      for (const item of list.items) seen.current.add(item.id);
      setItems(list.items);
      setUnread(count.unread);
      setPreferences(prefs);
      setPushConfig(push);
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? (loadError.payload?.message ?? 'دریافت اعلان‌ها ناموفق بود.')
          : 'دریافت اعلان‌ها ناموفق بود.',
      );
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      /* eslint-disable react-hooks/set-state-in-effect -- clear in-memory notification state when the session disappears */
      setItems([]);
      setUnread(0);
      setConnected(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    void refresh();
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible) return;
    let socket: Socket | null = null;
    try {
      socket = connectRealtime();
    } catch {
      return;
    }
    const onNew = (payload: { notification: NotificationDto; unread: number }) => {
      if (!payload.notification) return;
      if (!seen.current.has(payload.notification.id)) {
        seen.current.add(payload.notification.id);
        setItems((current) => [payload.notification, ...current].slice(0, 40));
        pushToast(payload.notification);
        if (prefsRef.current.soundEnabled) playNotificationSound();
      }
      setUnread(payload.unread);
    };
    const onUnread = (payload: { unread: number }) => setUnread(payload.unread);
    const onRead = (payload: { id: string; unread: number }) => {
      setItems((current) =>
        current.map((item) =>
          item.id === payload.id && item.readAt === null
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnread(payload.unread);
    };
    const onConnect = () => {
      setConnected(true);
      // Socket.IO does not replay missed chat events. Reconcile both the
      // notification list and any open chat after every (re)connect.
      setChatVersion((value) => value + 1);
      void refresh();
    };
    const onDisconnect = () => setConnected(false);
    const onChat = () => setChatVersion((value) => value + 1);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('notification:new', onNew);
    socket.on('notification:unread', onUnread);
    socket.on('notification:read', onRead);
    socket.on('chat:message', onChat);
    socket.on('chat:read', onChat);
    socket.on('chat:context', onChat);
    socket.on('chat:closed', onChat);
    const onInteraction = () => unlockNotificationSound();
    window.addEventListener('pointerdown', onInteraction, { once: true });
    window.addEventListener('keydown', onInteraction, { once: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      socket?.disconnect();
      socket?.off();
      window.removeEventListener('pointerdown', onInteraction);
      window.removeEventListener('keydown', onInteraction);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [visible, refresh, pushToast]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) window.clearTimeout(timer);
      map.clear();
    };
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await markNotificationRead(id);
      setItems((current) =>
        current.map((item) =>
          item.id === id && item.readAt === null
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnread((current) => Math.max(0, current - 1));
    } catch {
      await refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.readAt === null ? { ...item, readAt: now } : item)),
      );
      setUnread(0);
    } catch {
      await refresh();
    }
  }, [refresh]);

  const setSoundEnabled = useCallback(async (enabled: boolean) => {
    try {
      setPreferences(await updateNotificationPreferences({ soundEnabled: enabled }));
      if (enabled) {
        unlockNotificationSound();
        playNotificationSound();
      }
    } catch {
      await refresh();
    }
  }, [refresh]);

  const setBrowserPushEnabled = useCallback(
    async (enabled: boolean) => {
      setPushBusy(true);
      try {
        if (enabled) {
          if (!pushConfig?.enabled || !pushConfig.publicKey) {
            throw new Error('اعلان مرورگری در این سرور پیکربندی نشده است.');
          }
          await subscribePush(await subscribeToPush(pushConfig.publicKey));
          setPreferences(await updateNotificationPreferences({ browserPushEnabled: true }));
        } else {
          const endpoint = (await currentPushEndpoint()) ?? (await unsubscribeFromPush());
          if (endpoint) await unsubscribePush(endpoint);
          setPreferences(await updateNotificationPreferences({ browserPushEnabled: false }));
        }
      } catch (pushError) {
        setError(
          pushError instanceof Error
            ? pushError.message
            : 'تنظیم اعلان مرورگری ناموفق بود.',
        );
      } finally {
        setPushBusy(false);
      }
    },
    [pushConfig],
  );

  const value = useMemo<StoreNotificationValue>(
    () => ({
      items,
      unread,
      connected,
      preferences,
      pushConfig,
      pushBusy,
      toasts,
      chatVersion,
      refresh,
      markRead,
      markAllRead,
      setSoundEnabled,
      setBrowserPushEnabled,
      dismissToast,
      playTestSound: playNotificationSound,
      error,
    }),
    [
      items,
      unread,
      connected,
      preferences,
      pushConfig,
      pushBusy,
      toasts,
      chatVersion,
      refresh,
      markRead,
      markAllRead,
      setSoundEnabled,
      setBrowserPushEnabled,
      dismissToast,
      error,
    ],
  );

  return (
    <StoreNotificationContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          className="fixed bottom-4 start-4 z-[70] flex w-[min(21rem,calc(100vw-2rem))] flex-col gap-2"
          role="region"
          aria-label="اعلان‌های تازه"
        >
          {toasts.map((toast) => {
            const href = entityHref(toast.notification);
            return (
              <div
                key={toast.id}
                role="status"
                aria-live="polite"
                className="rounded-card border border-border bg-surface p-3 shadow-lg"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-fg">{toast.notification.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-fg-secondary">
                      {toast.notification.body}
                    </p>
                    <Link
                      href={href ?? '/notifications'}
                      onClick={() => {
                        if (toast.notification.readAt === null) void markRead(toast.id);
                        dismissToast(toast.id);
                      }}
                      className="mt-1.5 inline-block text-xs font-semibold text-accent hover:underline"
                    >
                      مشاهده
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="بستن اعلان"
                    className="rounded-control p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StoreNotificationContext.Provider>
  );
}

export function useStoreNotifications(): StoreNotificationValue {
  const value = useContext(StoreNotificationContext);
  if (!value) {
    throw new Error('useStoreNotifications must be used inside its provider');
  }
  return value;
}

export function notificationCountLabel(count: number): string {
  return count > 99 ? '۹۹+' : formatFaNumber(count);
}
