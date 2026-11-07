import type { RfqStatus } from '@sabz/types'
import { RFQ_STATUS_LABELS } from '../../lib/rfq-labels'
import { RFQ_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  return (
    <StatusBadge tone={RFQ_STATUS_TONES[status]}>
      {RFQ_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
