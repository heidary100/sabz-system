import type { InventoryMovementType } from '@sabz/types'
import { movementTypeLabel } from '../../lib/inventory-labels'
import { StatusBadge } from '../ui/status-badge'

export function InventoryMovementTypeBadge({ type }: { type: InventoryMovementType }) {
  return <StatusBadge tone="neutral">{movementTypeLabel(type)}</StatusBadge>
}
