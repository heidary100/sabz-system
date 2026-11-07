import type { ReturnStatus } from '@sabz/types'
import { RETURN_STATUS_LABELS } from '../../lib/return-labels'
import { RETURN_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return (
    <StatusBadge tone={RETURN_STATUS_TONES[status]}>
      {RETURN_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
