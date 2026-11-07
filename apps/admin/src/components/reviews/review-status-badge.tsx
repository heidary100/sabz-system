import type { ReviewStatus } from '@sabz/types'
import { REVIEW_STATUS_LABELS } from '../../lib/review-labels'
import { REVIEW_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <StatusBadge tone={REVIEW_STATUS_TONES[status]}>
      {REVIEW_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
