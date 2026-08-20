import type { ProductStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { PRODUCT_STATUS_LABELS } from '../../lib/product-labels'

const STATUS_COLORS: Record<ProductStatus, 'zinc' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'amber',
  PUBLISHED: 'green',
  ARCHIVED: 'zinc',
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge color={STATUS_COLORS[status]}>{PRODUCT_STATUS_LABELS[status]}</Badge>
}
