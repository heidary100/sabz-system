import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Heading } from '../catalyst/heading'
import { Text } from '../catalyst/text'
import { resolveRouteHelp } from '../../lib/route-help'
import { PageHelp, RouteHelpButton } from './page-help'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  // SS-269: every page whose route has registry help gets the info icon
  // automatically — pages never wire help content themselves.
  const location = useLocation()
  const help = resolveRouteHelp(location.pathname)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    // rule-double: the Orchard Ledger signature — every page header closes
    // with the Persian manuscript double rule (SS-267).
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Heading level={1}>{title}</Heading>
          {subtitle && <Text className="text-sm/6 text-muted">{subtitle}</Text>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {help && (
            <RouteHelpButton onOpen={() => setHelpOpen(true)} />
          )}
        </div>
      </div>
      <div aria-hidden="true" className="rule-double mt-3" />
      {help && (
        <PageHelp help={help} open={helpOpen} onClose={() => setHelpOpen(false)} />
      )}
    </div>
  )
}