import { Link } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useNotificationCenter } from './notification-center-provider'
import {
  notificationEntityLink,
  notificationTime,
} from '../../lib/notification-links'

/**
 * New-notification toasts (SS-900). Rendered once by the provider owner,
 * capped at three, dismissible, and never blocking the operator's work.
 */
export function NotificationToaster() {
  const { toasts, dismissToast, markRead } = useNotificationCenter()
  if (toasts.length === 0) {
    return null
  }
  return (
    <div
      className="pointer-events-none fixed bottom-4 start-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-label="اعلان‌های تازه"
    >
      {toasts.map((toast) => {
        const link = notificationEntityLink(toast.notification)
        return (
          <div
            key={toast.id}
            className="pointer-events-auto overflow-hidden rounded-card border border-border bg-surface-strong shadow-xl"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2.5 p-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-pill bg-primary-subtle text-primary">
                <Bell className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-5 text-foreground">
                  {toast.notification.title}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted">
                  {toast.notification.body}
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  {link ? (
                    <Link
                      to={link}
                      onClick={() => {
                        if (toast.notification.readAt === null) {
                          void markRead(toast.id)
                        }
                        dismissToast(toast.id)
                      }}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      مشاهده
                    </Link>
                  ) : (
                    <Link
                      to="/notifications"
                      onClick={() => dismissToast(toast.id)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      مرکز اعلان‌ها
                    </Link>
                  )}
                  <span className="text-[10px] text-muted">
                    {notificationTime(toast.notification.createdAt)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="بستن اعلان"
                className="rounded-control p-1 text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="h-0.5 w-full bg-primary/40" aria-hidden="true" />
          </div>
        )
      })}
    </div>
  )
}
