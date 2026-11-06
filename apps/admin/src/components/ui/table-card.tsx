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
        'rule-double-top rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-5',
      )}
    >
      {children}
      {footer && <div className="border-t border-border px-4 pt-4 sm:px-5">{footer}</div>}
    </div>
  )
}