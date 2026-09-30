import type { ReturnStatus } from '@sabz/types'

/**
 * Local Persian labels (SS-242). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (order-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید شد',
  RECEIVED: 'دریافت شد',
  COMPLETED: 'تکمیل شد',
  REJECTED: 'رد شد',
  CANCELLED: 'لغو شد',
}

export const RETURN_STATUS_ORDER: ReturnStatus[] = [
  'PENDING',
  'APPROVED',
  'RECEIVED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
]
