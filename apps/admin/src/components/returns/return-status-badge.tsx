import type { ReturnStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { RETURN_STATUS_LABELS } from '../../lib/return-labels'

const RETURN_STATUS_COLORS: Record<ReturnStatus, 'amber' | 'lime' | 'orange' | 'green' | 'red' | 'zinc'> = {
  PENDING: 'amber',
  APPROVED: 'lime',
  RECEIVED: 'orange',
  COMPLETED: 'green',
  REJECTED: 'red',
  CANCELLED: 'zinc',
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return (
    <Badge color={RETURN_STATUS_COLORS[status]}>
      {RETURN_STATUS_LABELS[status]}
    </Badge>
  )
}
