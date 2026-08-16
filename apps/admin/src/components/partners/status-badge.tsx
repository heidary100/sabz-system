import type { PartnerStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { PARTNER_STATUS_LABELS } from '../../lib/partner-labels'

const STATUS_COLORS: Record<PartnerStatus, 'zinc' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'zinc',
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
}

export function StatusBadge({ status }: { status: PartnerStatus }) {
  return <Badge color={STATUS_COLORS[status]}>{PARTNER_STATUS_LABELS[status]}</Badge>
}