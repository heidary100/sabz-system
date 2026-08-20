import { Badge } from '../catalyst/badge'

export function VariantAvailabilityBadge({ stockQuantity }: { stockQuantity: number }) {
  if (stockQuantity > 0) {
    return <Badge color="green">موجود</Badge>
  }
  return <Badge color="red">ناموجود</Badge>
}