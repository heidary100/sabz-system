import type { MerchMediaStatus } from '@sabz/types'
import { StatusBadge } from '../ui/status-badge'
import {
  merchMediaStatusLabel,
  merchMediaStatusTone,
} from '../../lib/merchandising-status'

export function MerchMediaStatusBadge({
  status,
}: {
  status: MerchMediaStatus
}) {
  return (
    <StatusBadge tone={merchMediaStatusTone(status)}>
      {merchMediaStatusLabel(status)}
    </StatusBadge>
  )
}
