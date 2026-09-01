import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  icon,
  actions,
}: {
  title: string
  description?: string
  icon?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 rounded-xl px-6 py-16 text-center">
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