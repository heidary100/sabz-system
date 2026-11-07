import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  icon,
  actions,
  size = 'default',
  className,
}: {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
  size?: 'default' | 'compact'
  className?: string
}) {
  return (
    <div
      className={`surface-card flex flex-col items-center justify-center gap-4 rounded-xl px-6 text-center ${
        size === 'compact' ? 'py-8' : 'py-16'
      } ${className ?? ''}`}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base/6 font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm/6 text-muted">{description}</p>}
      </div>
      {actions && <div className="mt-2">{actions}</div>}
    </div>
  )
}