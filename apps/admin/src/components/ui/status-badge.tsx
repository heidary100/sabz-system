import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Badge } from '../catalyst/badge'
import type { StatusTone } from '../../lib/status-tones'

/**
 * Shared semantic status badge (SS-271). Domain badge adapters resolve their
 * enum to a StatusTone and render through this component so light/dark token
 * mapping stays in one place.
 */
export function StatusBadge({
  tone,
  children,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<'span'>, 'color'> & {
  tone: StatusTone
  children: ReactNode
}) {
  return (
    <Badge color={tone} className={className} {...props}>
      {children}
    </Badge>
  )
}
