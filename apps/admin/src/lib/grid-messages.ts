import type { CatalogGridRowOutcome, CatalogGridRowResult } from '@sabz/types'

/**
 * Persian presentation for SS-257 batch row outcomes. The API already sends
 * Persian `message` values on failures; the fallbacks here cover outcomes
 * without a message (and keep the mapping testable without mocking API
 * payloads). A locked row gets a distinct message from a stale-version
 * conflict so the operator knows whether the data moved or the row was busy.
 */
const OUTCOME_FALLBACKS: Record<CatalogGridRowOutcome, string> = {
  SUCCESS: 'ذخیره شد',
  VALIDATION_ERROR: 'مقدار واردشده معتبر نیست.',
  CONFLICT_CHANGED: 'این ردیف از زمان بارگذاری تغییر کرده است؛ نسخه جدید را ببینید.',
  CONFLICT_LOCKED: 'این ردیف در حال حاضر توسط عملیات دیگری قفل شده است؛ کمی بعد دوباره تلاش کنید.',
  NOT_FOUND: 'این ردیف دیگر وجود ندارد.',
}

export function gridOutcomeMessage(result: CatalogGridRowResult): string {
  return result.message ?? OUTCOME_FALLBACKS[result.outcome]
}

export const GRID_STATUS_LABELS: Record<'PRICED' | 'CALL_FOR_PRICE', string> = {
  PRICED: 'قیمت‌دار',
  CALL_FOR_PRICE: 'تماس بگیرید (بدون قیمت)',
}
