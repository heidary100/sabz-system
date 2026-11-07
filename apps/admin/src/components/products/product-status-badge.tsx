import type { ProductStatus } from '@sabz/types'
import { PRODUCT_STATUS_LABELS } from '../../lib/product-labels'
import { PRODUCT_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return (
    <StatusBadge tone={PRODUCT_STATUS_TONES[status]}>
      {PRODUCT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
