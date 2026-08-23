import type { InventoryMovementType } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { movementTypeLabel } from '../../lib/inventory-labels'

export function InventoryMovementTypeBadge({ type }: { type: InventoryMovementType }) {
  return <Badge>{movementTypeLabel(type)}</Badge>
}