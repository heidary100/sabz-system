import type { ReviewStatus } from '@sabz/types'

/**
 * Local Persian labels (SS-240D). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (order-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید شد',
  REJECTED: 'رد شد',
}

export const REVIEW_STATUS_ORDER: ReviewStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
]
