import type {
  BlogStatus,
  InventoryStockStatus,
  NotificationType,
  OrderStatus,
  PartnerStatus,
  PaymentStatus,
  ProductStatus,
  ReservationStatus,
  ReturnStatus,
  ReviewStatus,
  RfqStatus,
  ShipmentStatus,
  UserStatus,
  WarehouseStatus,
} from '@sabz/types'

/**
 * Semantic tone vocabulary for workflow/status badges (SS-271).
 *
 * Keep the set small. Domain enums map onto these tones; the shared
 * StatusBadge owns the actual token classes so every surface renders the
 * same visual language in light and dark themes.
 */
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

export const ORDER_STATUS_TONES: Record<OrderStatus, StatusTone> = {
  PENDING: 'warning',
  PROCESSING: 'info',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
}

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, StatusTone> = {
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'danger',
}

export const SHIPMENT_STATUS_TONES: Record<ShipmentStatus, StatusTone> = {
  PENDING: 'warning',
  PICKED_UP: 'info',
  IN_TRANSIT: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
}

export const RETURN_STATUS_TONES: Record<ReturnStatus, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'info',
  RECEIVED: 'info',
  COMPLETED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
}

export const RFQ_STATUS_TONES: Record<RfqStatus, StatusTone> = {
  PENDING: 'warning',
  QUOTED: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
}

export const REVIEW_STATUS_TONES: Record<ReviewStatus, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

export const BLOG_STATUS_TONES: Record<BlogStatus, StatusTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
}

export const PRODUCT_STATUS_TONES: Record<ProductStatus, StatusTone> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  ARCHIVED: 'neutral',
}

export const PARTNER_STATUS_TONES: Record<PartnerStatus, StatusTone> = {
  DRAFT: 'neutral',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
}

export const USER_STATUS_TONES: Record<UserStatus, StatusTone> = {
  PENDING_OTP: 'warning',
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  LOCKED: 'warning',
}

export const WAREHOUSE_STATUS_TONES: Record<WarehouseStatus, StatusTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
}

export const INVENTORY_STOCK_STATUS_TONES: Record<InventoryStockStatus, StatusTone> = {
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
}

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, StatusTone> = {
  ACTIVE: 'info',
  RELEASED: 'neutral',
  CONSUMED: 'success',
  EXPIRED: 'neutral',
}

export const NOTIFICATION_TYPE_TONES: Record<NotificationType, StatusTone> = {
  ORDER_PLACED: 'success',
  ORDER_STATUS_CHANGED: 'info',
  SHIPMENT_UPDATED: 'info',
  RETURN_REQUESTED: 'warning',
  RETURN_STATUS_CHANGED: 'warning',
  RFQ_CREATED: 'info',
  RFQ_QUOTED: 'info',
  RFQ_DECIDED: 'neutral',
  PARTNER_SUBMITTED: 'warning',
  PARTNER_APPROVED: 'success',
  PARTNER_REJECTED: 'danger',
}
