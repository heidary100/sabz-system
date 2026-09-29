import type { RfqStatus } from '@sabz/types'
import { RFQ_STATUS_LABELS } from '../../lib/rfq-labels'
import { Badge } from '../catalyst/badge'

const RFQ_STATUS_COLORS: Record<
  RfqStatus,
  'amber' | 'lime' | 'green' | 'red' | 'zinc'
> = {
  PENDING: 'amber',
  QUOTED: 'lime',
  ACCEPTED: 'green',
  REJECTED: 'red',
  EXPIRED: 'zinc',
}

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return <Badge color={RFQ_STATUS_COLORS[status]}>{RFQ_STATUS_LABELS[status]}</Badge>
}
