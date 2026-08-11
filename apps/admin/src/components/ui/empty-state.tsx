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
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
      {icon && <div className="flex size-12 items-center justify-center rounded-lg bg-hunter-900 text-primary">{icon}</div>}
      <div className="space-y-1">
        <h3 className="text-base/6 font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm/6 text-dust-200">{description}</p>}
      </div>
      {actions && <div className="mt-2">{actions}</div>}
    </div>
  )
}
