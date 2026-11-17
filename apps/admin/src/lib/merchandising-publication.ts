import type {
  HomepageDraftValidationResult,
  HomepageValidationIssue,
} from '@sabz/types'
import type { StatusTone } from './status-tones'

/**
 * Publication readiness for the homepage draft (SS-279).
 *
 * Readiness is derived only from the established SS-276 draft lifecycle. This
 * module never treats a successful save as readiness, and it never treats a
 * validation of unsaved local edits as saved-revision validation.
 */
export type HomepageReadinessStep =
  | 'NO_DRAFT'
  | 'LOADING'
  | 'PUBLISHING'
  | 'CONFLICT'
  | 'SAVING'
  | 'DIRTY'
  | 'VALIDATING'
  | 'NOT_VALIDATED'
  | 'LOCAL_VALIDATION'
  | 'OUTDATED'
  | 'ERRORS'
  | 'READY_WITH_WARNINGS'
  | 'READY'

export interface HomepageReadinessInput {
  hasDraft: boolean
  loading: boolean
  revision: number | null
  schemaVersion: number | null
  dirty: boolean
  saving: boolean
  conflict: boolean
  validating: boolean
  validation: HomepageDraftValidationResult | null
  validationTarget: 'local' | 'server' | null
  validationOutdated: boolean
  publishing: boolean
}

export interface HomepageReadiness {
  step: HomepageReadinessStep
  label: string
  tone: StatusTone
  publishable: boolean
  requiresWarningAcknowledgement: boolean
  errorCount: number
  warningCount: number
  blockingReason: string | null
}

const STEP_META: Record<
  HomepageReadinessStep,
  { label: string; tone: StatusTone; blockingReason: string | null }
> = {
  NO_DRAFT: {
    label: 'پیش‌نویس در دسترس نیست',
    tone: 'neutral',
    blockingReason: 'پیش‌نویس صفحه اصلی بارگذاری نشده است.',
  },
  LOADING: {
    label: 'در حال بازخوانی پیش‌نویس',
    tone: 'info',
    blockingReason:
      'نسخه سرور در حال بازخوانی است؛ تا پایان آن انتشار ممکن نیست.',
  },
  PUBLISHING: {
    label: 'در حال انتشار',
    tone: 'info',
    blockingReason: 'درخواست انتشار در جریان است.',
  },
  CONFLICT: {
    label: 'تعارض نسخه',
    tone: 'danger',
    blockingReason:
      'تا زمان بررسی تعارض نسخه، انتشار ممکن نیست. تغییرات محلی حفظ می‌شوند.',
  },
  SAVING: {
    label: 'در حال ذخیره پیش‌نویس',
    tone: 'info',
    blockingReason: 'پس از پایان ذخیره، دوباره وضعیت انتشار را بررسی کنید.',
  },
  DIRTY: {
    label: 'تغییرات ذخیره‌نشده',
    tone: 'warning',
    blockingReason:
      'انتشار فقط روی نسخه ذخیره‌شده انجام می‌شود؛ ابتدا تغییرات را ذخیره کنید.',
  },
  VALIDATING: {
    label: 'در حال اعتبارسنجی',
    tone: 'info',
    blockingReason: 'نتیجه اعتبارسنجی هنوز آماده نیست.',
  },
  NOT_VALIDATED: {
    label: 'اعتبارسنجی‌نشده',
    tone: 'warning',
    blockingReason:
      'برای انتشار، نسخه ذخیره‌شده را اعتبارسنجی کنید. ذخیره موفق به‌تنهایی به معنای آمادگی انتشار نیست.',
  },
  LOCAL_VALIDATION: {
    label: 'اعتبارسنجی تغییرات محلی',
    tone: 'warning',
    blockingReason:
      'نتیجه فعلی مربوط به تغییرات محلی است، نه نسخه ذخیره‌شده؛ ابتدا ذخیره و سپس اعتبارسنجی کنید.',
  },
  OUTDATED: {
    label: 'اعتبارسنجی قدیمی',
    tone: 'warning',
    blockingReason:
      'پس از تغییر پیش‌نویس یا تغییر نسخه، نتیجه اعتبارسنجی به‌روز نیست؛ دوباره اعتبارسنجی کنید.',
  },
  ERRORS: {
    label: 'نیازمند اصلاح',
    tone: 'danger',
    blockingReason: 'خطاهای اعتبارسنجی مانع انتشار هستند.',
  },
  READY_WITH_WARNINGS: {
    label: 'آماده انتشار با هشدار',
    tone: 'warning',
    blockingReason: null,
  },
  READY: {
    label: 'آماده انتشار',
    tone: 'success',
    blockingReason: null,
  },
}

export function deriveHomepageReadiness(
  input: HomepageReadinessInput,
): HomepageReadiness {
  const validation = input.validation
  const errorCount = validation?.errors.length ?? 0
  const warningCount = validation?.warnings.length ?? 0

  let step: HomepageReadinessStep
  if (!input.hasDraft || input.revision === null) {
    step = 'NO_DRAFT'
  } else if (input.loading) {
    step = 'LOADING'
  } else if (input.publishing) {
    step = 'PUBLISHING'
  } else if (input.conflict) {
    step = 'CONFLICT'
  } else if (input.saving) {
    step = 'SAVING'
  } else if (input.dirty) {
    step = 'DIRTY'
  } else if (input.validating) {
    step = 'VALIDATING'
  } else if (!validation) {
    step = 'NOT_VALIDATED'
  } else if (input.validationTarget !== 'server') {
    step = 'LOCAL_VALIDATION'
  } else if (
    input.validationOutdated ||
    validation.revision !== input.revision ||
    validation.schemaVersion !== input.schemaVersion
  ) {
    step = 'OUTDATED'
  } else if (errorCount > 0 || !validation.valid) {
    step = 'ERRORS'
  } else if (warningCount > 0) {
    step = 'READY_WITH_WARNINGS'
  } else {
    step = 'READY'
  }

  const meta = STEP_META[step]
  const publishable = step === 'READY' || step === 'READY_WITH_WARNINGS'

  return {
    step,
    label: meta.label,
    tone: meta.tone,
    publishable,
    requiresWarningAcknowledgement: step === 'READY_WITH_WARNINGS',
    errorCount,
    warningCount,
    blockingReason: meta.blockingReason,
  }
}

const VALIDATION_CATEGORIES = new Set([
  'STRUCTURAL',
  'MISSING_REFERENCE',
  'INELIGIBLE_REFERENCE',
  'WARNING',
])

function parseIssue(value: unknown): HomepageValidationIssue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  if (
    typeof record.path !== 'string' ||
    typeof record.code !== 'string' ||
    typeof record.message !== 'string'
  ) {
    return null
  }
  return {
    path: record.path,
    code: record.code,
    message: record.message,
    severity: record.severity === 'WARNING' ? 'WARNING' : 'ERROR',
    category: VALIDATION_CATEGORIES.has(String(record.category))
      ? (record.category as HomepageValidationIssue['category'])
      : 'STRUCTURAL',
  }
}

/**
 * Normalizes publication-time validation issues without dropping unknown
 * paths, codes, or messages. Non-issue payload members are ignored.
 */
export function parseHomepageValidationIssues(
  value: unknown,
): HomepageValidationIssue[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const parsed = parseIssue(item)
    return parsed ? [parsed] : []
  })
}

/** Labels the draft/publication revision comparison as indicative only. */
export function publicationRevisionComparison(
  draftRevision: number | null,
  publicationSourceRevision: number | null,
): string {
  const draft =
    draftRevision === null ? '—' : draftRevision.toLocaleString('fa-IR')
  const source =
    publicationSourceRevision === null
      ? '—'
      : publicationSourceRevision.toLocaleString('fa-IR')
  return `نسخه پیش‌نویس فعلی ${draft} · نسخه منتشرشده بر پایه پیش‌نویس ${source}`
}
