import type { BlogStatus } from '@sabz/types'
import { BLOG_STATUS_LABELS } from '../../lib/blog-labels'
import { BLOG_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function BlogStatusBadge({ status }: { status: BlogStatus }) {
  return (
    <StatusBadge tone={BLOG_STATUS_TONES[status]}>
      {BLOG_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
