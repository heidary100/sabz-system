/**
 * In-app notification center contract (SS-243, extended SS-900).
 *
 * One row per recipient: owner events (order/shipment/return/RFQ/partner/chat
 * decisions) address the customer, admin alerts fan out to one row per
 * OPERATOR/ADMIN user. Rows carry a Persian title/body rendered at emit time
 * plus an entity/entityId backlink for the UI. The database is the source of
 * truth; WebSocket delivery is an optimization, never storage.
 */

export type NotificationType =
  | 'ORDER_PLACED'
  | 'ORDER_STATUS_CHANGED'
  | 'SHIPMENT_UPDATED'
  | 'RETURN_REQUESTED'
  | 'RETURN_STATUS_CHANGED'
  | 'RFQ_CREATED'
  | 'RFQ_QUOTED'
  | 'RFQ_DECIDED'
  | 'PARTNER_SUBMITTED'
  | 'PARTNER_APPROVED'
  | 'PARTNER_REJECTED'
  | 'CHAT_MESSAGE'
  | 'CHAT_REPLY';

export const NOTIFICATION_TYPE_FA: Record<NotificationType, string> = {
  ORDER_PLACED: 'ثبت سفارش',
  ORDER_STATUS_CHANGED: 'تغییر وضعیت سفارش',
  SHIPMENT_UPDATED: 'به‌روزرسانی مرسوله',
  RETURN_REQUESTED: 'درخواست مرجوعی',
  RETURN_STATUS_CHANGED: 'تغییر وضعیت مرجوعی',
  RFQ_CREATED: 'ثبت استعلام',
  RFQ_QUOTED: 'قیمت‌گذاری استعلام',
  RFQ_DECIDED: 'تعیین تکلیف استعلام',
  PARTNER_SUBMITTED: 'ثبت درخواست همکاری',
  PARTNER_APPROVED: 'تأیید همکاری',
  PARTNER_REJECTED: 'رد همکاری',
  CHAT_MESSAGE: 'پیام پشتیبانی',
  CHAT_REPLY: 'پاسخ پشتیبانی',
};

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const NOTIFICATION_PRIORITY_FA: Record<NotificationPriority, string> = {
  LOW: 'کم',
  NORMAL: 'عادی',
  HIGH: 'مهم',
  URGENT: 'فوری',
};

export interface NotificationDto {
  id: string;
  type: NotificationType;
  typeFa: string;
  title: string;
  body: string;
  priority: NotificationPriority;
  category: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationDto[];
  total: number;
  page: number;
  limit: number;
}

export interface UnreadCountResponse {
  unread: number;
}

export interface MarkAllNotificationsReadResponse {
  updated: number;
  unread: 0;
}

export interface NotificationPreferenceDto {
  soundEnabled: boolean;
  browserPushEnabled: boolean;
}

export interface UpdateNotificationPreferenceInput {
  soundEnabled?: boolean;
  browserPushEnabled?: boolean;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushConfigResponse {
  enabled: boolean;
  publicKey: string | null;
}

/** WebSocket contract (SS-900). */
export interface NotificationSocketEvent {
  notification: NotificationDto;
  unread: number;
}

export interface NotificationUnreadEvent {
  unread: number;
}

export interface ChatSocketMessageEvent {
  conversationId: string;
  message: import('../chat/chat').ChatMessageDto;
  unreadForCustomer: number;
  unreadForAdmin: number;
  customerUserId: string;
}
