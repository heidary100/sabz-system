import type {
  HomepageDraftValidationResult,
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
  HomepageValidationIssue,
} from '@sabz/types'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { formatTehranDateTime } from '../../../lib/tehran-time'
import {
  publicationRevisionComparison,
  type HomepageReadiness,
} from '../../../lib/merchandising-publication'
import { sectionIndexFromValidationPath } from '../../../lib/merchandising-homepage'
import {
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
} from '../../../lib/merchandising-status'

const MAX_SUMMARY_ISSUES = 3

function IssueSummary({
  issues,
  tone,
  onSelectSection,
}: {
  issues: HomepageValidationIssue[]
  tone: 'error' | 'warning'
  onSelectSection: (index: number) => void
}) {
  if (issues.length === 0) {
    return null
  }
  const visible = issues.slice(0, MAX_SUMMARY_ISSUES)
  const remaining = issues.length - visible.length
  return (
    <div className="space-y-1.5">
      {visible.map((issue, index) => {
        const sectionIndex = sectionIndexFromValidationPath(issue.path)
        const className =
          tone === 'error'
            ? 'danger-box block w-full rounded-lg px-3 py-2 text-start'
            : 'warning-box block w-full rounded-lg px-3 py-2 text-start'
        const content = (
          <>
            <span className="block text-sm text-foreground">{issue.message}</span>
            <span className="mt-1 block text-xs text-muted">
              <span dir="ltr">{issue.path}</span> ·{' '}
              <span dir="ltr">{issue.code}</span>
            </span>
          </>
        )
        return sectionIndex === null ? (
          <div
            key={`${issue.path}-${issue.code}-${index}`}
            className={className}
          >
            {content}
          </div>
        ) : (
          <button
            key={`${issue.path}-${issue.code}-${index}`}
            type="button"
            className={`${className} focus-ring`}
            onClick={() => onSelectSection(sectionIndex)}
          >
            {content}
          </button>
        )
      })}
      {remaining > 0 && (
        <Text className="text-xs text-muted">
          و {remaining.toLocaleString('fa-IR')} مورد دیگر در پنل اعتبارسنجی.
        </Text>
      )}
    </div>
  )
}

export function HomepageReadinessCard({
  revision,
  schemaVersion,
  sectionCount,
  readiness,
  validation,
  localValidation,
  currentPublication,
  currentLoading,
  currentError,
  publishing,
  publishedPublication,
  canPublish,
  publicationConflict,
  onSave,
  onValidate,
  onPublish,
  onSchedule,
  onSelectSection,
  onReloadDraft,
  onRefreshCurrent,
}: {
  revision: number | null
  schemaVersion: number | null
  sectionCount: number
  readiness: HomepageReadiness
  validation: HomepageDraftValidationResult | null
  localValidation: boolean
  currentPublication: HomepagePublicationSummaryDto | null
  currentLoading: boolean
  currentError: string | null
  publishing: boolean
  publishedPublication: HomepagePublicationDto | null
  canPublish: boolean
  publicationConflict: boolean
  onSave: () => void
  onValidate: () => void
  onPublish: () => void
  onSchedule: () => void
  onSelectSection: (index: number) => void
  onReloadDraft: () => void
  onRefreshCurrent: () => void
}) {
  const showSave = readiness.step === 'DIRTY'
  const showValidate =
    readiness.step === 'NOT_VALIDATED' || readiness.step === 'OUTDATED'
  const showPublish =
    readiness.publishable && canPublish && publishedPublication === null
  const showSchedule =
    readiness.publishable && canPublish && publishedPublication === null
  const showOperatorNotice =
    !canPublish && publishedPublication === null

  return (
    <section
      aria-labelledby="homepage-readiness-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="homepage-readiness-heading"
            className="text-sm font-semibold text-foreground"
          >
            آمادگی انتشار
          </h2>
          <Text className="text-xs text-muted">
            ذخیره موفق به‌تنهایی نشانه آمادگی انتشار نیست؛ ملاک، اعتبارسنجی نسخه
            ذخیره‌شده روی سرور است.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={readiness.tone}>{readiness.label}</StatusBadge>
          <StatusBadge tone="neutral">
            {sectionCount.toLocaleString('fa-IR')} بخش
          </StatusBadge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
          <p className="text-xs text-muted">نسخه پیش‌نویس</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {revision === null ? '—' : revision.toLocaleString('fa-IR')}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
          <p className="text-xs text-muted">نسخه ساختار</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {schemaVersion === null
              ? '—'
              : schemaVersion.toLocaleString('fa-IR')}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
          <p className="text-xs text-muted">خطا / هشدار</p>
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {readiness.errorCount.toLocaleString('fa-IR')} /{' '}
            {readiness.warningCount.toLocaleString('fa-IR')}
          </p>
        </div>
      </div>

      {readiness.blockingReason && (
        <p
          role="status"
          className={
            readiness.step === 'ERRORS' || readiness.step === 'CONFLICT'
              ? 'rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger'
              : 'rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning'
          }
        >
          {readiness.blockingReason}
        </p>
      )}

      {localValidation && (
        <p
          role="status"
          className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          نتیجه اعتبارسنجی فعلی مربوط به تغییرات محلی ارسال‌شده است و برای
          انتشار نسخه ذخیره‌شده معتبر نیست. ابتدا ذخیره و سپس اعتبارسنجی کنید.
        </p>
      )}

      {publicationConflict && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-subtle px-3 py-2">
          <Text className="text-sm text-warning">
            نسخه سرور با نسخه اعتبارسنجی‌شده متفاوت است. برای ادامه، پیش‌نویس
            را از سرور بازخوانی کنید؛ تغییرات محلی بدون تأیید بازنویسی نمی‌شوند.
          </Text>
          <Button outline onClick={onReloadDraft}>
            بازخوانی پیش‌نویس از سرور
          </Button>
        </div>
      )}

      {validation && validation.errors.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-danger">خطاهای اعتبارسنجی</p>
          <IssueSummary
            issues={validation.errors}
            tone="error"
            onSelectSection={onSelectSection}
          />
        </div>
      )}

      {validation && validation.warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-warning">
            هشدارهای اعتبارسنجی
          </p>
          <IssueSummary
            issues={validation.warnings}
            tone="warning"
            onSelectSection={onSelectSection}
          />
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-foreground">
            نسخه منتشرشده فعلی
          </p>
          <Button
            plain
            disabled={currentLoading}
            onClick={onRefreshCurrent}
          >
            {currentLoading ? 'در حال بررسی…' : 'به‌روزرسانی وضعیت'}
          </Button>
        </div>
        {currentError ? (
          <InlineError message={currentError} />
        ) : currentPublication ? (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                tone={homepagePublicationStatusTone(currentPublication.status)}
              >
                {homepagePublicationStatusLabel(currentPublication.status)}
              </StatusBadge>
              <span className="text-sm text-foreground">
                نسخه {currentPublication.version.toLocaleString('fa-IR')}
              </span>
              {currentPublication.publishedAt && (
                <span className="text-xs text-muted">
                  {formatTehranDateTime(currentPublication.publishedAt)}
                </span>
              )}
            </div>
            <Text className="text-xs text-muted">
              {publicationRevisionComparison(
                revision,
                currentPublication.sourceDraftRevision,
              )}{' '}
              — این مقایسه فقط شاخص است و تفاوت محتوایی تضمین‌شده نیست.
            </Text>
            {currentPublication.note && (
              <Text className="text-xs text-muted">
                یادداشت: {currentPublication.note}
              </Text>
            )}
          </div>
        ) : (
          <Text className="text-sm text-muted">
            هنوز نسخه‌ای از صفحه اصلی منتشر نشده است.
          </Text>
        )}
      </div>

      {publishedPublication && (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-success-border bg-success-subtle p-3"
        >
          <p className="text-sm font-semibold text-success">
            {publishedPublication.status === 'SCHEDULED'
              ? 'انتشار صفحه اصلی زمان‌بندی شد.'
              : 'صفحه اصلی با موفقیت منتشر شد.'}
          </p>
          <p className="text-sm text-foreground">
            نسخه {publishedPublication.version.toLocaleString('fa-IR')} ·{' '}
            {publishedPublication.status === 'SCHEDULED'
              ? formatTehranDateTime(publishedPublication.publishAt)
              : formatTehranDateTime(publishedPublication.publishedAt)}{' '}
            · بر پایه پیش‌نویس{' '}
            {publishedPublication.sourceDraftRevision.toLocaleString('fa-IR')}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showSave && (
          <Button outline onClick={onSave}>
            ذخیره تغییرات
          </Button>
        )}
        {showValidate && (
          <Button outline onClick={onValidate}>
            بررسی اعتبارسنجی
          </Button>
        )}
        {showPublish && (
          <Button color="primary" disabled={publishing} onClick={onPublish}>
            {publishing ? 'در حال انتشار…' : 'انتشار فوری صفحه اصلی'}
          </Button>
        )}
        {showSchedule && (
          <Button outline disabled={publishing} onClick={onSchedule}>
            زمان‌بندی انتشار
          </Button>
        )}
        {showOperatorNotice && (
          <Text className="text-sm text-muted">
            انتشار فوری و زمان‌بندی فقط برای نقش مدیر (ADMIN) فعال است. شما
            می‌توانید پیش‌نویس را ویرایش و اعتبارسنجی کنید.
          </Text>
        )}
      </div>
    </section>
  )
}
