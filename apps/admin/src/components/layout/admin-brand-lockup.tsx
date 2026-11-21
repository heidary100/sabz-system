import { Link } from 'react-router-dom'
import clsx from 'clsx'

/**
 * Admin brand lockup. Uses the official transparent mark (exact supplied
 * artwork, rendered without recoloring or distortion) plus the Persian
 * wordmark. The image is intentionally separate from the wordmark.
 */
export function AdminBrandLockup({
  collapsed = false,
  size = 36,
  to = '/dashboard',
}: {
  collapsed?: boolean
  size?: number
  to?: string
}) {
  return (
    <Link
      to={to}
      aria-label="سبز سیستم — پیشخوان"
      className={clsx(
        'inline-flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        collapsed && 'justify-center',
      )}
    >
      <img
        src="/brand/logo-64.png"
        alt=""
        width={size}
        height={size}
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-bold tracking-tight text-foreground">
            سبز سیستم
          </span>
          <span className="block text-[10px] font-medium text-muted">پنل مدیریت</span>
        </span>
      )}
    </Link>
  )
}
