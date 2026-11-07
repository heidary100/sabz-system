import type { ReactNode } from 'react'
import { CircleAlert } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../catalyst/button'

/**
 * Page/section-level failure state (SS-271). Replaces the repeated
 * `surface-card flex flex-col items-center…` error card so retry affordances,
 * iconography, and alert semantics stay consistent across routes.
 */
export function ErrorState({
  message,
  title,
  onRetry,
  retryLabel = 'تلاش مجدد',
  children,
  icon,
  size = 'default',
  className,
}: {
  message: ReactNode
  title?: string
  onRetry?: () => void
  retryLabel?: string
  children?: ReactNode
  icon?: ReactNode
  size?: 'default' | 'compact'
  className?: string
}) {
  return (
    <div
      role="alert"
      className={clsx(
        'surface-card flex flex-col items-center gap-4 rounded-xl px-6 text-center',
        size === 'compact' ? 'py-8' : 'py-16',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-lg bg-danger-subtle text-danger">
        {icon ?? <CircleAlert className="size-6" aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        {title && <h3 className="text-base/6 font-semibold text-foreground">{title}</h3>}
        <p className="text-sm/6 text-muted">{message}</p>
      </div>
      {onRetry && (
        <Button color="primary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
      {children}
    </div>
  )
}
