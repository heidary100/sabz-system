import type { BlogStatus } from '@sabz/types'
import { BLOG_STATUS_LABELS } from '../../lib/blog-labels'
import { Badge } from '../catalyst/badge'

const BLOG_STATUS_COLORS: Record<BlogStatus, 'amber' | 'green'> = {
  DRAFT: 'amber',
  PUBLISHED: 'green',
}

export function BlogStatusBadge({ status }: { status: BlogStatus }) {
  return <Badge color={BLOG_STATUS_COLORS[status]}>{BLOG_STATUS_LABELS[status]}</Badge>
}
