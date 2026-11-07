import type { UserStatus } from '@sabz/types'
import { USER_STATUS_LABELS } from '../../lib/user-labels'
import { USER_STATUS_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <StatusBadge tone={USER_STATUS_TONES[status]}>
      {USER_STATUS_LABELS[status]}
    </StatusBadge>
  )
}
