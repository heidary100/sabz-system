import { Link } from 'react-router-dom'
import {
  Bell,
  BellOff,
  CheckCheck,
  Circle,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react'
import clsx from 'clsx'
import { useNotificationCenter } from './notification-center-provider'
import { NotificationTypeBadge } from './notification-type-badge'
import {
  notificationEntityLink,
  notificationTime,
} from '../../lib/notification-links'
import { formatFaNumber } from '../../lib/format'

/**
 * Header notification bell + popover (SS-900). Purpose-built rather than a
 * table: unread hierarchy, priority cue, relative time, direct mark-read and
 * crash-safe links into the relevant admin context.
 */
export function NotificationBell() {
  const {
    items,
    unread,
    loading,
    error,
    connected,
    preferences,
    markRead,
    markAllRead,
    setSoundEnabled,
    refresh,
  } = useNotificationCenter()

  const preview = items.slice(0, 8)

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label={unread > 0 ? `اعلان‌ها، ${formatFaNumber(unread)} خوانده‌نشده` : 'اعلان‌ها'}
        className="relative inline-flex min-h-10 min-w-10 items-center justify-center rounded-control text-muted transition-colors hover:bg-primary-subtle hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -top-1 -end-1 flex min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-5 text-on-danger">
            {formatFaNumber(unread > 99 ? 99 : unread)}
          </span>
        )}
      </PopoverButton>
      <Transition
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel
          anchor="bottom end"
          className="z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] origin-top overflow-hidden rounded-card border border-border bg-surface-strong shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-bold text-foreground">اعلان‌ها</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                {connected ? (
                  <Wifi className="size-3.5 text-success" aria-hidden="true" />
                ) : (
                  <WifiOff className="size-3.5 text-warning" aria-hidden="true" />
                )}
                {connected ? 'به‌روزرسانی زنده' : 'اتصال مجدد…'}
                {unread > 0 ? ` — ${formatFaNumber(unread)} خوانده‌نشده` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void setSoundEnabled(!preferences.soundEnabled)}
                aria-label={preferences.soundEnabled ? 'بی‌صدا کردن اعلان‌ها' : 'روشن کردن صدای اعلان‌ها'}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-foreground"
              >
                {preferences.soundEnabled ? (
                  <Volume2 className="size-4" aria-hidden="true" />
                ) : (
                  <VolumeX className="size-4" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={unread === 0}
                aria-label="خوانده‌شدن همه اعلان‌ها"
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-control text-muted hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCheck className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="space-y-2 p-4" aria-busy="true">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-16 animate-pulse rounded-control bg-surface-2" />
                ))}
              </div>
            ) : error ? (
              <div className="p-4 text-sm text-danger">
                {error}
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="ms-2 font-semibold underline"
                >
                  تلاش دوباره
                </button>
              </div>
            ) : preview.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <BellOff className="size-8 text-muted" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-foreground">اعلانی ندارید</p>
                <p className="mt-1 text-xs text-muted">رویدادهای سفارش، پشتیبانی و عملیات اینجا نمایش داده می‌شوند.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {preview.map((notification) => {
                  const link = notificationEntityLink(notification)
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {notification.readAt === null && (
                              <Circle className="size-2 fill-primary text-primary" aria-label="خوانده‌نشده" />
                            )}
                            <p
                              className={clsx(
                                'text-sm leading-6',
                                notification.readAt === null
                                  ? 'font-bold text-foreground'
                                  : 'font-medium text-foreground/80',
                              )}
                            >
                              {notification.title}
                            </p>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">
                            {notification.body}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <NotificationTypeBadge type={notification.type} />
                            <span className="text-[11px] text-muted">{notificationTime(notification.createdAt)}</span>
                            {notification.priority === 'URGENT' || notification.priority === 'HIGH' ? (
                              <span className="rounded-pill bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                                {notification.priority === 'URGENT' ? 'فوری' : 'مهم'}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {notification.readAt === null && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void markRead(notification.id)
                            }}
                            className="shrink-0 rounded-pill p-1 text-muted hover:bg-primary-subtle hover:text-primary"
                            aria-label="خوانده شد"
                            title="خوانده شد"
                          >
                            <CheckCheck className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </>
                  )
                  return (
                    <li key={notification.id}>
                      {link ? (
                        <Link
                          to={link}
                          onClick={() => {
                            if (notification.readAt === null) {
                              void markRead(notification.id)
                            }
                          }}
                          className="block px-4 py-3 transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-surface-2/50 px-4 py-2.5">
            <Link
              to="/notifications"
              className="text-xs font-semibold text-primary hover:underline"
            >
              مرکز اعلان‌ها
            </Link>
            <Link
              to="/notifications#settings"
              className="text-xs text-muted hover:text-foreground hover:underline"
            >
              تنظیمات صدا و اعلان مرورگری
            </Link>
          </div>
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}
