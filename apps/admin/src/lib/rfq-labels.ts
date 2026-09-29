import type { RfqStatus } from '@sabz/types'

/**
 * Local Persian labels (SS-240C). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (order-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const RFQ_STATUS_LABELS: Record<RfqStatus, string> = {
  PENDING: 'در انتظار قیمت‌گذاری',
  QUOTED: 'قیمت اعلام شد',
  ACCEPTED: 'پذیرفته شد',
  REJECTED: 'رد شد',
  EXPIRED: 'منقضی شد',
}

export const RFQ_STATUS_ORDER: RfqStatus[] = [
  'PENDING',
  'QUOTED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
]
