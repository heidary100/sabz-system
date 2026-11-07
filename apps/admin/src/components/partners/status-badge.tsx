import type { PartnerStatus } from '@sabz/types'
import { PARTNER_STATUS_LABELS } from '../../lib/partner-labels'
import { PARTNER_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  return (
    <StatusBadge tone={PARTNER_STATUS_TONES[status]}>
      {PARTNER_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
