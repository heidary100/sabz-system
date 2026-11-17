import type {
  AuditEntry,
  HomepagePublicationStatus,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import type { StatusTone } from './status-tones'

export type PublicationDiagnosticKind =
  | 'SCHEDULED_WAITING'
  | 'SCHEDULED_RETRYING'
  | 'ACTIVATED'
  | 'PUBLISHED'
  | 'ROLLED_BACK'
  | 'OPERATOR_CANCELLED'
  | 'SYSTEM_BLOCKED'
  | 'CANCELLED_UNKNOWN'
  | 'SUPERSEDED'
  | 'UNKNOWN'

export interface PublicationDiagnostic {
  kind: PublicationDiagnosticKind
  label: string
  tone: StatusTone
  summary: string
  evidence: AuditEntry | null
  failureCodes: string[]
  retryable: boolean
  origin: 'system' | 'operator' | null
}

export type PublicationDiagnosticInput = Pick<
  HomepagePublicationSummaryDto,
  'status' | 'rollbackFromPublicationId'
>

const ACTIONS = {
  scheduled: 'HOMEPAGE_PUBLICATION_SCHEDULED',
  published: 'HOMEPAGE_PUBLICATION_PUBLISHED',
  activated: 'HOMEPAGE_SCHEDULED_ACTIVATED',
  blocked: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
  failed: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
  cancelled: 'HOMEPAGE_PUBLICATION_CANCELLED',
  rollbackCreated: 'HOMEPAGE_ROLLBACK_CREATED',
  rollbackFailed: 'HOMEPAGE_ROLLBACK_FAILED',
} as const

const DIAGNOSTIC_CODE_LABELS: Record<string, string> = {
  NEWER_PUBLICATION_ACTIVE: 'نسخه جدیدتری در حال حاضر منتشر شده است.',
  DEPENDENCIES_INVALID: 'وابستگی‌های نسخه در زمان فعال‌سازی معتبر نبوده‌اند.',
  SNAPSHOT_INVALID: 'ساختار snapshot نسخه معتبر نبوده است.',
  SNAPSHOT_MISSING: 'snapshot نسخه در دسترس نبوده است.',
  SNAPSHOT_SCHEMA_MISMATCH: 'نسخه ساختار snapshot با نسخه ثبت‌شده سازگار نیست.',
  SNAPSHOT_STRUCTURE_INVALID: 'ساختار snapshot با قوانین فعلی سازگار نیست.',
  MEDIA_MISSING: 'رسانه ارجاع‌شده در دسترس نبوده است.',
  MEDIA_DELETED: 'رسانه ارجاع‌شده حذف شده است.',
  HERO_DESKTOP_MEDIA_REQUIRED: 'رسانه دسکتاپ هیرو الزامی است.',
  TRANSIENT_ACTIVATION_FAILURE: 'خطای موقت در فعال‌سازی رخ داده است.',
}

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!record) return null
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function readStringArray(
  record: Record<string, unknown> | null,
  key: string,
): string[] {
  if (!record) return []
  const value = record[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function diagnosticCodeLabel(code: string): string {
  return DIAGNOSTIC_CODE_LABELS[code] ?? code
}

export function auditActorLabel(entry: AuditEntry): string {
  if (entry.actor) {
    return (
      [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(' ') ||
      entry.actor.mobile
    )
  }
  if (entry.userId) {
    return entry.userId.startsWith('system:')
      ? `سیستم (${entry.userId})`
      : entry.userId
  }
  return 'سیستم/ناشناس'
}

export function auditEventDisposition(action: string): {
  label: string
  tone: StatusTone
} {
  switch (action) {
    case ACTIONS.activated:
      return { label: 'فعال‌سازی', tone: 'success' }
    case ACTIONS.blocked:
      return { label: 'مسدودسازی سیستم', tone: 'danger' }
    case ACTIONS.failed:
      return { label: 'تلاش ناموفق موقت', tone: 'warning' }
    case ACTIONS.cancelled:
      return { label: 'لغو اپراتور', tone: 'neutral' }
    case ACTIONS.rollbackCreated:
      return { label: 'بازگردانی', tone: 'info' }
    case ACTIONS.rollbackFailed:
      return { label: 'خطای بازگردانی', tone: 'danger' }
    case ACTIONS.scheduled:
      return { label: 'زمان‌بندی', tone: 'info' }
    case ACTIONS.published:
      return { label: 'انتشار', tone: 'success' }
    default:
      return { label: 'سایر', tone: 'neutral' }
  }
}

function newest(entries: AuditEntry[]): AuditEntry | null {
  if (entries.length === 0) return null
  return entries.reduce((latest, entry) =>
    Date.parse(entry.createdAt) > Date.parse(latest.createdAt) ? entry : latest,
  )
}

function failureCodesFor(entry: AuditEntry | null): string[] {
  if (!entry) return []
  const codes: string[] = []
  const code = readString(entry.after, 'code')
  const errorCode = readString(entry.after, 'errorCode')
  if (code) codes.push(code)
  if (errorCode) codes.push(errorCode)
  codes.push(...readStringArray(entry.after, 'dependencyCodes'))
  return [...new Set(codes)]
}

/**
 * Derives a publication diagnostic only from authoritative status and audit
 * evidence. A generic CANCELLED status alone is never turned into a known
 * reason.
 */
export function classifyPublicationDiagnostic(
  publication: PublicationDiagnosticInput,
  entries: AuditEntry[],
): PublicationDiagnostic {
  const byAction = (action: string): AuditEntry | null =>
    newest(entries.filter((entry) => entry.action === action))

  if (publication.status === 'SCHEDULED') {
    const failed = byAction(ACTIONS.failed)
    if (failed) {
      return {
        kind: 'SCHEDULED_RETRYING',
        label: 'تلاش ناموفق موقت',
        tone: 'warning',
        summary:
          'آخرین تلاش فعال‌سازی ناموفق بوده است؛ نسخه همچنان زمان‌بندی‌شده باقی مانده و ممکن است سرور در تلاش بعدی دوباره آن را بررسی کند.',
        evidence: failed,
        failureCodes: failureCodesFor(failed),
        retryable: true,
        origin: 'system',
      }
    }
    return {
      kind: 'SCHEDULED_WAITING',
      label: 'در انتظار فعال‌سازی',
      tone: 'info',
      summary:
        'این نسخه زمان‌بندی شده است و تا فعال‌سازی، محتوای عمومی فعلی فروشگاه تغییر نمی‌کند.',
      evidence: null,
      failureCodes: [],
      retryable: false,
      origin: null,
    }
  }

  if (publication.status === 'CANCELLED') {
    const terminal = newest(
      [byAction(ACTIONS.blocked), byAction(ACTIONS.cancelled)].filter(
        (entry): entry is AuditEntry => entry !== null,
      ),
    )
    if (terminal?.action === ACTIONS.blocked) {
      return {
        kind: 'SYSTEM_BLOCKED',
        label: 'لغو توسط سیستم',
        tone: 'danger',
        summary:
          'فعال‌سازی این انتشار توسط سیستم مسدود و نسخه لغو شده است. کدهای تشخیصی ثبت‌شده در همین صفحه آمده‌اند.',
        evidence: terminal,
        failureCodes: failureCodesFor(terminal),
        retryable: false,
        origin: 'system',
      }
    }
    if (terminal?.action === ACTIONS.cancelled) {
      return {
        kind: 'OPERATOR_CANCELLED',
        label: 'لغو توسط اپراتور',
        tone: 'neutral',
        summary:
          'این انتشار زمان‌بندی‌شده با درخواست اپراتور لغو شده است. محتوای عمومی فعلی فروشگاه تغییر نکرده است.',
        evidence: terminal,
        failureCodes: [],
        retryable: false,
        origin: 'operator',
      }
    }
    return {
      kind: 'CANCELLED_UNKNOWN',
      label: 'لغوشده — دلیل نامشخص',
      tone: 'neutral',
      summary:
        'این نسخه لغو شده است، اما شاهد گردش فعالیتی برای تشخیص علت لغو در دسترس نیست. از وضعیت به‌تنهایی دلیلی استنتاج نمی‌شود.',
      evidence: null,
      failureCodes: [],
      retryable: false,
      origin: null,
    }
  }

  if (publication.status === 'PUBLISHED') {
    if (publication.rollbackFromPublicationId) {
      return {
        kind: 'ROLLED_BACK',
        label: 'بازگردانی‌شده',
        tone: 'info',
        summary:
          'این نسخه از یک snapshot تاریخی بازگردانی شده است و اکنون نسخه منتشرشده جاری است.',
        evidence: byAction(ACTIONS.rollbackCreated),
        failureCodes: [],
        retryable: false,
        origin: null,
      }
    }
    const activated = byAction(ACTIONS.activated)
    if (activated) {
      return {
        kind: 'ACTIVATED',
        label: 'فعال‌سازی‌شده',
        tone: 'success',
        summary:
          'این نسخه زمان‌بندی‌شده در موعد مقرر توسط سرور فعال و منتشر شده است.',
        evidence: activated,
        failureCodes: [],
        retryable: false,
        origin: null,
      }
    }
    return {
      kind: 'PUBLISHED',
      label: 'منتشرشده',
      tone: 'success',
      summary: 'این نسخه در حال حاضر منتشرشده است.',
      evidence: byAction(ACTIONS.published),
      failureCodes: [],
      retryable: false,
      origin: null,
    }
  }

  if (publication.status === 'SUPERSEDED') {
    return {
      kind: 'SUPERSEDED',
      label: 'تاریخی / جایگزین‌شده',
      tone: 'neutral',
      summary:
        'این نسخه تاریخی جایگزین شده است؛ snapshot آن تغییرناپذیر می‌ماند.',
      evidence: null,
      failureCodes: [],
      retryable: false,
      origin: null,
    }
  }

  return {
    kind: 'UNKNOWN',
    label: 'وضعیت نامشخص',
    tone: 'neutral',
    summary: 'وضعیت این نسخه از داده معتبر فعلی قابل تشخیص نیست.',
    evidence: null,
    failureCodes: [],
    retryable: false,
    origin: null,
  }
}

export function isRollbackEligible(
  status: HomepagePublicationStatus,
): boolean {
  return status === 'SUPERSEDED'
}
