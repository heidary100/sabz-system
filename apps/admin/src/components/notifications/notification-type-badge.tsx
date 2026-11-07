import type { NotificationType } from '@sabz/types'
import { NOTIFICATION_TYPE_LABELS } from '../../lib/notification-labels'
import { NOTIFICATION_TYPE_TONES } from '../../lib/status-tones'
import { StatusBadge } from '../ui/status-badge'

export function NotificationTypeBadge({ type }: { type: NotificationType }) {
  return (
    <StatusBadge tone={NOTIFICATION_TYPE_TONES[type]}>
      {NOTIFICATION_TYPE_LABELS[type]}
    </StatusBadge>
  )
}
