import type {
  HomepageDraftSection,
  HomepageDraftValidationResult,
  HomepageValidationIssue,
} from '@sabz/types'
import { Text } from '../../catalyst/text'
import { StatusBadge } from '../../ui/status-badge'
import { InlineError } from '../../ui/inline-error'
import {
  groupHomepageValidation,
  sectionTypeLabel,
} from '../../../lib/merchandising-homepage'
import type { HomepageValidationTarget } from '../../../hooks/use-homepage-draft'

function IssueList({
  issues,
  tone,
  onSelectSection,
  sectionIndex,
}: {
  issues: HomepageValidationIssue[]
  tone: 'error' | 'warning'
  onSelectSection: (index: number) => void
  sectionIndex: number | null
}) {
  if (issues.length === 0) {
    return null
  }
  return (
    <ul className="space-y-2">
      {issues.map((issue, index) => {
        const content = (
          <>
            <span className="block text-sm text-foreground">{issue.message}</span>
            <span className="mt-1 block text-xs text-muted">
              <span dir="ltr">{issue.path}</span> · <span dir="ltr">{issue.code}</span>{' '}
              · {issue.category}
            </span>
          </>
        )
        const className =
          tone === 'error'
            ? 'danger-box block w-full rounded-lg px-3 py-2 text-start'
            : 'warning-box block w-full rounded-lg px-3 py-2 text-start'
        return (
          <li key={`${issue.path}-${issue.code}-${index}`}>
            {sectionIndex === null ? (
              <div className={className}>{content}</div>
            ) : (
              <button
                type="button"
                className={`${className} focus-ring`}
                onClick={() => onSelectSection(sectionIndex)}
              >
                {content}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function HomepageValidationPanel({
  validation,
  target,
  outdated,
  validationError,
  sections,
  onSelectSection,
}: {
  validation: HomepageDraftValidationResult | null
  target: HomepageValidationTarget | null
  outdated: boolean
  validationError: string | null
  sections: HomepageDraftSection[]
  onSelectSection: (index: number) => void
}) {
  if (!validation && !validationError) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">
          اعتبارسنجی پیش‌نویس
        </p>
        <Text className="mt-1 text-sm text-muted">
          برای بررسی خطاها و هشدارها، دکمه «اعتبارسنجی» را بزنید. اعتبارسنجی
          تغییرات محلی، سند ارسال‌شده را بررسی می‌کند و پیش‌نویس ذخیره‌شده را
          تغییر نمی‌دهد.
        </Text>
      </div>
    )
  }

  if (validationError && !validation) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">
          اعتبارسنجی پیش‌نویس
        </p>
        <InlineError className="mt-3" message={validationError} />
      </div>
    )
  }

  if (!validation) {
    return null
  }

  const grouping = groupHomepageValidation(validation, sections.length)
  const targetLabel =
    target === 'local'
      ? 'تغییرات محلی ارسال‌شده برای اعتبارسنجی (بدون ذخیره)'
      : 'نسخه ذخیره‌شده روی سرور'

  return (
    <section
      aria-labelledby="homepage-validation-heading"
      className="space-y-4 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="homepage-validation-heading"
            className="text-sm font-semibold text-foreground"
          >
            نتیجه اعتبارسنجی
          </h2>
          <Text className="text-xs text-muted">{targetLabel}</Text>
          <Text className="text-xs text-muted">
            نسخه سرور هنگام اعتبارسنجی:{' '}
            {validation.revision.toLocaleString('fa-IR')} · ساختار{' '}
            {validation.schemaVersion.toLocaleString('fa-IR')}
          </Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={grouping.errorCount > 0 ? 'danger' : 'success'}>
            {grouping.errorCount.toLocaleString('fa-IR')} خطا
          </StatusBadge>
          <StatusBadge tone={grouping.warningCount > 0 ? 'warning' : 'neutral'}>
            {grouping.warningCount.toLocaleString('fa-IR')} هشدار
          </StatusBadge>
          <StatusBadge tone={validation.valid ? 'success' : 'danger'}>
            {validation.valid ? 'معتبر' : 'نیازمند اصلاح'}
          </StatusBadge>
        </div>
      </div>

      {outdated && (
        <p
          role="status"
          className="rounded-lg bg-warning-subtle px-3 py-2 text-sm text-warning"
        >
          این نتیجه برای ویرایش‌های فعلی به‌روز نیست؛ پس از تغییر بخش‌ها دوباره
          اعتبارسنجی کنید.
        </p>
      )}
      {validationError && <InlineError message={validationError} />}

      {grouping.errorCount === 0 && grouping.warningCount === 0 && (
        <Text className="text-sm text-success">
          خطا یا هشداری برای این سند پیدا نشد.
        </Text>
      )}

      <div className="space-y-4">
        {sections.map((section, index) => {
          const bucket = grouping.bySection.get(index)
          if (!bucket) {
            return null
          }
          return (
            <div
              key={section.key}
              className="space-y-2 rounded-lg border border-border bg-background/40 p-3"
            >
              <p className="text-sm font-medium text-foreground">
                بخش {(index + 1).toLocaleString('fa-IR')} ·{' '}
                {sectionTypeLabel(section.type)}
              </p>
              <IssueList
                issues={bucket.errors}
                tone="error"
                sectionIndex={index}
                onSelectSection={onSelectSection}
              />
              <IssueList
                issues={bucket.warnings}
                tone="warning"
                sectionIndex={index}
                onSelectSection={onSelectSection}
              />
            </div>
          )
        })}

        {(grouping.unmapped.errors.length > 0 ||
          grouping.unmapped.warnings.length > 0) && (
          <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
            <p className="text-sm font-medium text-foreground">
              مسائل بدون بخش مشخص
            </p>
            <Text className="text-xs text-muted">
              این مسیرها به بخش مشخصی از سند نگاشت نشدند و برای بررسی حفظ شده‌اند.
            </Text>
            <IssueList
              issues={grouping.unmapped.errors}
              tone="error"
              sectionIndex={null}
              onSelectSection={onSelectSection}
            />
            <IssueList
              issues={grouping.unmapped.warnings}
              tone="warning"
              sectionIndex={null}
              onSelectSection={onSelectSection}
            />
          </div>
        )}
      </div>
    </section>
  )
}
