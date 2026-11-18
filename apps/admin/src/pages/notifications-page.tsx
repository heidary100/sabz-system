import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  BellRing,
  CheckCheck,
  Inbox,
  RefreshCw,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react'
import clsx from 'clsx'
import { useNotificationCenter } from '../components/notifications/notification-center-provider'
import { NotificationTypeBadge } from '../components/notifications/notification-type-badge'
import { Button } from '../components/catalyst/button'
import { EmptyState } from '../components/ui/empty-state'
import { InlineError } from '../components/ui/inline-error'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { formatFaNumber } from '../lib/format'
import {
  notificationEntityLink,
  notificationTime,
} from '../lib/notification-links'

type Filter = 'all' | 'unread'

/**
 * Notification center (SS-900). A purpose-built activity surface: unread
 * hierarchy, priority cues, direct actions and presentation preferences.
 * Deliberately not a generic table.
 */
export function NotificationsPage() {
  const {
    items,
    unread,
    loading,
    error,
    connected,
    preferences,
    pushConfig,
    pushBusy,
    preferenceError,
    refresh,
    markRead,
    markAllRead,
    setSoundEnabled,
    setBrowserPushEnabled,
    playTestSound,
  } = useNotificationCenter()
  const [filter, setFilter] = useState<Filter>('unread')

  const visible = filter === 'unread' ? items.filter((item) => item.readAt === null) : items
  const unreadCount = unread

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="مرکز اعلان‌ها"
        subtitle={
          unreadCount > 0
            ? `${formatFaNumber(unreadCount)} اعلان خوانده‌نشده دارید.`
            : 'همه اعلان‌ها را دیده‌اید.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold',
                connected
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning',
              )}
            >
              {connected ? (
                <Wifi className="size-3.5" aria-hidden="true" />
              ) : (
                <WifiOff className="size-3.5" aria-hidden="true" />
              )}
              {connected ? 'زنده' : 'اتصال مجدد'}
            </span>
            <Button outline onClick={() => void refresh()} disabled={loading}>
              <RefreshCw
                className={clsx('size-4', loading && 'animate-spin')}
                aria-hidden="true"
              />
              تازه‌سازی
            </Button>
            <Button onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              <CheckCheck className="size-4" aria-hidden="true" />
              همه خوانده شد
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-w-0 space-y-3" aria-label="فهرست اعلان‌ها">
          <div className="flex items-center gap-1 rounded-pill border border-border bg-surface p-1">
            {(
              [
                ['unread', `خوانده‌نشده${unreadCount > 0 ? ` (${formatFaNumber(unreadCount)})` : ''}`],
                ['all', 'همه'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={clsx(
                  'min-h-9 flex-1 rounded-pill px-3 text-sm font-medium transition-colors',
                  filter === value
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'text-muted hover:bg-surface-2 hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {preferenceError && <InlineError message={preferenceError} />}

          {loading && items.length === 0 ? (
            <Loading label="در حال بارگذاری اعلان‌ها…" />
          ) : error ? (
            <div className="space-y-3">
              <InlineError message={error} />
              <Button outline onClick={() => void refresh()}>
                تلاش دوباره
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" aria-hidden="true" />}
              title={filter === 'unread' ? 'اعلان خوانده‌نشده‌ای ندارید' : 'اعلانی ثبت نشده است'}
              description={
                filter === 'unread'
                  ? 'اعلان‌های تازه با همین‌جا و به‌صورت زنده همگام می‌شوند.'
                  : 'رویدادهای سفارش، مرجوعی، استعلام و پشتیبانی اینجا ثبت می‌شوند.'
              }
              actions={
                filter === 'unread' && items.length > 0 ? (
                  <Button outline onClick={() => setFilter('all')}>
                    مشاهده همه اعلان‌ها
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {visible.map((notification) => {
                const link = notificationEntityLink(notification)
                const unreadItem = notification.readAt === null
                const priority = notification.priority
                return (
                  <li
                    key={notification.id}
                    className={clsx(
                      'group relative overflow-hidden rounded-card border bg-surface p-4 transition-colors',
                      unreadItem
                        ? 'border-primary/30 shadow-sm'
                        : 'border-border opacity-90',
                    )}
                  >
                    {unreadItem && (
                      <span
                        className="absolute inset-y-0 start-0 w-1 bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex items-start gap-3">
                      <span
                        className={clsx(
                          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-pill',
                          unreadItem
                            ? 'bg-primary-subtle text-primary'
                            : 'bg-surface-2 text-muted',
                        )}
                      >
                        {notification.type === 'CHAT_MESSAGE' ? (
                          <BellRing className="size-4" aria-hidden="true" />
                        ) : (
                          <Bell className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p
                              className={clsx(
                                'text-sm leading-6',
                                unreadItem
                                  ? 'font-bold text-foreground'
                                  : 'font-medium text-foreground/90',
                              )}
                            >
                              {notification.title}
                            </p>
                            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-muted">
                              {notification.body}
                            </p>
                          </div>
                          <time
                            dateTime={notification.createdAt}
                            className="shrink-0 text-[11px] text-muted"
                          >
                            {notificationTime(notification.createdAt)}
                          </time>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <NotificationTypeBadge type={notification.type} />
                          {priority === 'HIGH' || priority === 'URGENT' ? (
                            <span className="rounded-pill bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
                              {priority === 'URGENT' ? 'فوری' : 'مهم'}
                            </span>
                          ) : null}
                          {link ? (
                            <Link
                              to={link}
                              onClick={() => {
                                if (unreadItem) {
                                  void markRead(notification.id)
                                }
                              }}
                              className="rounded-control px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-subtle"
                            >
                              مشاهده در زمینه
                            </Link>
                          ) : null}
                          {unreadItem ? (
                            <button
                              type="button"
                              onClick={() => void markRead(notification.id)}
                              className="rounded-control px-2 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground"
                            >
                              علامت خوانده‌شده
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-4" id="settings">
          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="text-sm font-bold text-foreground">تنظیمات نمایش</h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              اعلان‌های درون‌برنامه‌ای همیشه فعال‌اند؛ صدا و اعلان مرورگری اختیاری است.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  {preferences.soundEnabled ? (
                    <Volume2 className="size-4 text-primary" aria-hidden="true" />
                  ) : (
                    <VolumeX className="size-4 text-muted" aria-hidden="true" />
                  )}
                  صدای اعلان
                </span>
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(event) => void setSoundEnabled(event.target.checked)}
                  className="size-4 accent-primary"
                  aria-label="صدای اعلان"
                />
              </label>
              <button
                type="button"
                onClick={playTestSound}
                disabled={!preferences.soundEnabled}
                className="text-xs font-semibold text-primary hover:underline disabled:opacity-40"
              >
                آزمایش صدا
              </button>
              <div className="border-t border-border pt-3">
                <label className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">اعلان مرورگری</span>
                    <span className="mt-0.5 block text-[11px] leading-5 text-muted">
                      {pushConfig?.enabled
                        ? 'برای دریافت اعلان هنگام بسته‌بودن صفحه.'
                        : 'در این سرور پیکربندی نشده است (VAPID).'}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={preferences.browserPushEnabled}
                    disabled={pushBusy || !pushConfig?.enabled}
                    onChange={(event) => void setBrowserPushEnabled(event.target.checked)}
                    className="mt-1 size-4 accent-primary disabled:opacity-40"
                    aria-label="اعلان مرورگری"
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-card border border-border bg-surface p-4 text-xs leading-6 text-muted">
            <h2 className="text-sm font-bold text-foreground">چطور کار می‌کند</h2>
            <p className="mt-1.5">
              اعلان‌ها در پایگاه داده ذخیره می‌شوند؛ اتصال زنده فقط تحویل را سریع می‌کند.
              بعد از قطعی یا بستن مرورگر، با بازگشت دوباره وضعیت خوانده‌شدن همگام می‌شود.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
