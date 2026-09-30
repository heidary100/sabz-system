import type { BlogStatus } from '@sabz/types'

/**
 * Local Persian labels (SS-240E). The admin keeps runtime label maps in
 * `lib/*-labels.ts` (order-labels pattern) and imports only *types* from
 * `@sabz/types`: the package ships a CJS dist, which Vite dev serves raw
 * via /@fs where named ESM imports fail at runtime.
 */
export const BLOG_STATUS_LABELS: Record<BlogStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PUBLISHED: 'منتشر شده',
}

export const BLOG_STATUS_ORDER: BlogStatus[] = ['DRAFT', 'PUBLISHED']
