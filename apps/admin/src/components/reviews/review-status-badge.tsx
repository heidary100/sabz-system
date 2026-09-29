import type { ReviewStatus } from '@sabz/types'
import { REVIEW_STATUS_LABELS } from '../../lib/review-labels'
import { Badge } from '../catalyst/badge'

const REVIEW_STATUS_COLORS: Record<ReviewStatus, 'amber' | 'green' | 'red'> = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge color={REVIEW_STATUS_COLORS[status]}>{REVIEW_STATUS_LABELS[status]}</Badge>
}
