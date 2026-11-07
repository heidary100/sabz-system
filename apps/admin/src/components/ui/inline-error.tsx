import type { ReactNode } from 'react'
import clsx from 'clsx'

/**
 * Inline form/dialog error (SS-271). Wraps the existing `danger-box` visual
 * so call sites share alert semantics without changing the layout.
 */
export function InlineError({
  message,
  className,
  role = 'alert',
}: {
  message: ReactNode
  className?: string
  role?: 'alert' | 'status' | 'none'
}) {
  return (
    <p
      role={role === 'none' ? undefined : role}
      className={clsx('danger-box rounded-lg px-3 py-2 text-sm', className)}
    >
      {message}
    </p>
  )
}
