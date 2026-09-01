import clsx from 'clsx'
import type { ReactNode } from 'react'

export function TableCard({
  children,
  footer,
  className,
}: {
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx(className, 'rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5')}>
      {children}
      {footer && <div className="border-t border-border px-4 pt-4 sm:px-5">{footer}</div>}
    </div>
  )
}