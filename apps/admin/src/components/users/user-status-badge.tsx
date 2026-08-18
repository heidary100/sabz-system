import type { UserStatus } from '@sabz/types'
import { Badge } from '../catalyst/badge'
import { USER_STATUS_LABELS } from '../../lib/user-labels'

const STATUS_COLORS: Record<UserStatus, 'zinc' | 'amber' | 'green' | 'red'> = {
  PENDING_OTP: 'amber',
  ACTIVE: 'green',
  SUSPENDED: 'red',
  LOCKED: 'zinc',
}

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge color={STATUS_COLORS[status]}>{USER_STATUS_LABELS[status]}</Badge>
}
