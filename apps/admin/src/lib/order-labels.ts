import type { AdminOrderTransition, OrderStatus } from '@sabz/types'

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  'PENDING',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]

/** Legal operator moves per status (mirrors the API lifecycle guard). */
export const ORDER_NEXT_TRANSITIONS: Record<OrderStatus, AdminOrderTransition[]> = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
}

export const ORDER_TRANSITION_LABELS: Record<AdminOrderTransition, string> = {
  PROCESSING: 'شروع آماده‌سازی',
  SHIPPED: 'ثبت ارسال',
  DELIVERED: 'ثبت تحویل (تسویه COD)',
  CANCELLED: 'لغو سفارش',
}

export const ORDER_TRANSITION_DESCRIPTIONS: Record<AdminOrderTransition, string> = {
  PROCESSING: 'سفارش وارد مرحله آماده‌سازی می‌شود.',
  SHIPPED: 'سفارش ارسال‌شده ثبت می‌شود.',
  DELIVERED:
    'تحویل سفارش ثبت می‌شود؛ مبلغ سفارش‌های پرداخت در محل در همین مرحله تسویه‌شده محسوب می‌شود.',
  CANCELLED:
    'سفارش لغو و موجودی مصرف‌شده به انبار بازمی‌گردد. این عمل قابل بازگشت نیست.',
}
