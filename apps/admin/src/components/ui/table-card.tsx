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
    // rule-double-top: the Orchard Ledger signature — the Persian manuscript
    // double rule crowns every table card (SS-267).
    <div
      className={clsx(
        className,
        'min-w-0 rule-double-top rounded-xl border border-border bg-surface p-3 shadow-sm sm:p-4',
      )}
    >
      {children}
      {footer && <div className="border-t border-border px-3 pt-3 sm:px-4">{footer}</div>}
    </div>
  )
}