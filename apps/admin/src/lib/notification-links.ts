import type { NotificationDto } from '@sabz/types'

/** Internal admin route for a notification's entity, or null when none. */
export function notificationEntityLink(
  notification: Pick<NotificationDto, 'entity' | 'entityId'>,
): string | null {
  const { entity, entityId } = notification
  if (!entity || !entityId) {
    return null
  }
  switch (entity) {
    case 'Order':
      return `/orders/${entityId}`
    case 'ReturnRequest':
      return `/returns/${entityId}`
    case 'Rfq':
      return `/rfq/${entityId}`
    case 'Partner':
      return `/partners/${entityId}`
    case 'ChatConversation':
      return `/chat?conversation=${entityId}`
    case 'Product':
      return `/products/${entityId}`
    default:
      return null
  }
}

export function notificationTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('fa-IR', {
        calendar: 'persian',
        timeZone: 'Asia/Tehran',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      }).format(date)
}
