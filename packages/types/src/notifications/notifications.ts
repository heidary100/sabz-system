/**
 * In-app notification center contract (SS-243, master plan §6 Stage 3).
 *
 * One row per recipient: owner events (order/shipment/return/RFQ/partner
 * decisions) address the customer, admin alerts fan out to one row per
 * OPERATOR/ADMIN user. Rows carry a Persian title/body rendered at emit
 * time plus an entity/entityId backlink for the UI. Real SMS/email/push
 * delivery is a future ticket — the API ships a log-only stub.
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
  | 'PARTNER_REJECTED';

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
};

export interface NotificationDto {
  id: string;
  type: NotificationType;
  typeFa: string;
  title: string;
  body: string;
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
