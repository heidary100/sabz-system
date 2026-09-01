import type { ReactNode } from 'react'
import { Heading } from '../catalyst/heading'
import { Text } from '../catalyst/text'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <Heading level={1}>{title}</Heading>
        {subtitle && <Text className="text-sm/6 text-muted">{subtitle}</Text>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}