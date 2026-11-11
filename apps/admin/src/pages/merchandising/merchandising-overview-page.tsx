import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  HomepagePublicationSummaryDto,
  MerchCampaignSummaryDto,
  MerchMediaSummaryDto,
} from '@sabz/types'
import { RefreshCw } from 'lucide-react'
import { useAuth } from '../../auth/auth-provider'
import { Button } from '../../components/catalyst/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/catalyst/table'
import { Text } from '../../components/catalyst/text'
import { MerchCampaignStatusBadge } from '../../components/merchandising/merch-campaign-status-badge'
import { MerchMediaStatusBadge } from '../../components/merchandising/merch-media-status-badge'
import { EmptyState } from '../../components/ui/empty-state'
import { InlineError } from '../../components/ui/inline-error'
import { LinkButton } from '../../components/ui/link-button'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { StatusBadge } from '../../components/ui/status-badge'
import { TableCard } from '../../components/ui/table-card'
import { useMerchandisingOverview } from '../../hooks/use-merchandising-overview'
import { translateApiError } from '../../lib/error-messages'
import { formatTehranDateTime } from '../../lib/tehran-time'
import { deriveHomepageReadiness } from '../../lib/merchandising-publication'
import {
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
} from '../../lib/merchandising-status'

const SCHEDULED_LIMIT = 5

function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string
  detail?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {detail && <Text className="text-xs text-muted">{detail}</Text>}
      </div>
      {action}
    </div>
  )
}

function SectionError({
  error,
  onRetry,
}: {
  error: unknown
  onRetry: () => void
}) {
  return (
    <div className="space-y-2">
      <InlineError message={translateApiError(error)} />
      <Button outline onClick={onRetry}>
        تلاش مجدد
      </Button>
    </div>
  )
}

function Refreshing({ visible }: { visible: boolean }) {
  return visible ? (
    <p role="status" className="text-xs text-muted">
      در حال به‌روزرسانی…
    </p>
  ) : null
}

function PublicationSummary({
  publication,
  emptyTitle,
  emptyDescription,
  timestampLabel,
  timestamp,
}: {
  publication: HomepagePublicationSummaryDto | null
  emptyTitle: string
  emptyDescription: string
  timestampLabel: string
  timestamp: string | null
}) {
  if (!publication) {
    return (
      <EmptyState
        size="compact"
        title={emptyTitle}
        description={emptyDescription}
        actions={
          <LinkButton to="/merchandising/homepage" outline>
            ویرایش صفحه اصلی
          </LinkButton>
        }
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={homepagePublicationStatusTone(publication.status)}>
          {homepagePublicationStatusLabel(publication.status)}
        </StatusBadge>
        <span className="text-sm font-semibold text-foreground">
          نسخه {publication.version.toLocaleString('fa-IR')}
        </span>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">{timestampLabel}</dt>
          <dd className="text-foreground" dir="ltr">
            {formatTehranDateTime(timestamp)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">نسخه پیش‌نویس منبع</dt>
          <dd className="tabular-nums text-foreground">
            {publication.sourceDraftRevision.toLocaleString('fa-IR')}
          </dd>
        </div>
      </dl>
      <Link
        className="focus-ring inline-flex text-sm font-medium text-primary hover:text-primary-dark"
        to={`/merchandising/publications/${publication.id}`}
      >
        مشاهده جزئیات انتشار
      </Link>
    </div>
  )
}

function CampaignTable({ items }: { items: MerchCampaignSummaryDto[] }) {
  return (
    <Table dense>
      <TableHead>
        <TableRow>
          <TableHeader>کمپین</TableHeader>
          <TableHeader>وضعیت</TableHeader>
          <TableHeader>آخرین تغییر</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((campaign) => (
          <TableRow key={campaign.id}>
            <TableCell>
              <Link
                className="font-medium text-foreground hover:text-primary"
                to={`/merchandising/campaigns/${campaign.id}`}
              >
                {campaign.titleFa}
              </Link>
              <p className="text-xs text-muted">{campaign.internalName}</p>
            </TableCell>
            <TableCell>
              <MerchCampaignStatusBadge status={campaign.status} />
            </TableCell>
            <TableCell className="text-xs text-muted">
              {formatTehranDateTime(campaign.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MediaTable({ items }: { items: MerchMediaSummaryDto[] }) {
  return (
    <Table dense>
      <TableHead>
        <TableRow>
          <TableHeader>فایل</TableHeader>
          <TableHeader>وضعیت</TableHeader>
          <TableHeader>آخرین تغییر</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map((media) => (
          <TableRow key={media.id}>
            <TableCell>
              <Link
                className="font-medium text-foreground hover:text-primary"
                to="/merchandising/media"
              >
                <span dir="ltr">{media.originalName}</span>
              </Link>
            </TableCell>
            <TableCell>
              <MerchMediaStatusBadge status={media.status} />
            </TableCell>
            <TableCell className="text-xs text-muted">
              {formatTehranDateTime(media.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function pickEarliestScheduled(
  items: HomepagePublicationSummaryDto[],
): {
  publication: HomepagePublicationSummaryDto | null
  invalidDate: boolean
} {
  let selected: HomepagePublicationSummaryDto | null = null
  let selectedTime = Number.POSITIVE_INFINITY

  for (const publication of items) {
    if (!publication.publishAt) {
      continue
    }
    const time = Date.parse(publication.publishAt)
    if (!Number.isFinite(time)) {
      continue
    }
    if (time < selectedTime) {
      selected = publication
      selectedTime = time
    }
  }

  if (!selected && items.length > 0) {
    return {
      publication: items[0] ?? null,
      invalidDate: true,
    }
  }

  return {
    publication: selected,
    invalidDate: false,
  }
}

export function MerchandisingOverviewPage() {
  const { user } = useAuth()
  const {
    currentPublication,
    scheduledPublications,
    draft,
    draftValidation,
    campaigns,
    media,
    refreshAll,
  } = useMerchandisingOverview()

  const canAdmin = user?.roles.includes('ADMIN') ?? false
  const scheduledItems = scheduledPublications.data?.items ?? []
  const scheduled = pickEarliestScheduled(scheduledItems)
  const scheduledQualified =
    (scheduledPublications.data?.total ?? 0) > SCHEDULED_LIMIT

  const readiness = useMemo(() => {
    if (!draft.data) return null
    return deriveHomepageReadiness({
      hasDraft: true,
      loading: false,
      revision: draft.data.revision,
      schemaVersion: draft.data.schemaVersion,
      dirty: false,
      saving: false,
      conflict: false,
      validating: draftValidation.loading,
      validation: draftValidation.data,
      validationTarget: draftValidation.data ? 'server' : null,
      validationOutdated: false,
      publishing: false,
    })
  }, [draft.data, draftValidation.data, draftValidation.loading])

  const anyLoading =
    currentPublication.loading ||
    scheduledPublications.loading ||
    draft.loading ||
    draftValidation.loading ||
    campaigns.loading ||
    media.loading

  const hasAnyData = Boolean(
    currentPublication.data ||
      scheduledPublications.data ||
      draft.data ||
      draftValidation.data ||
      campaigns.data ||
      media.data,
  )
  const initialLoading = anyLoading && !hasAnyData
  const anyError = Boolean(
    currentPublication.error ||
      scheduledPublications.error ||
      draft.error ||
      draftValidation.error ||
      campaigns.error ||
      media.error,
  )
  const wasLoadingRef = useRef(anyLoading)
  const [completionMessage, setCompletionMessage] = useState<string | null>(
    null,
  )

  useEffect(() => {
    if (anyLoading) {
      setCompletionMessage(null)
    } else if (wasLoadingRef.current) {
      setCompletionMessage(
        anyError
          ? 'بارگذاری وضعیت بازاریابی با خطا مواجه شد.'
          : 'وضعیت بازاریابی به‌روزرسانی شد.',
      )
    }
    wasLoadingRef.current = anyLoading
  }, [anyLoading, anyError])

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="نمای کلی بازاریابی"
        subtitle="وضعیت صفحه اصلی، انتشارها، کمپین‌ها و رسانه‌های بازاریابی؛ هر بخش مستقل از دیگری بارگذاری می‌شود."
        actions={
          <Button outline onClick={refreshAll} disabled={anyLoading}>
            <RefreshCw data-slot="icon" />
            {anyLoading ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی همه'}
          </Button>
        }
      />

      {initialLoading && (
        <p role="status" className="sr-only">
          در حال بارگذاری وضعیت بازاریابی…
        </p>
      )}
      {!anyLoading && completionMessage && (
        <p role="status" className="sr-only">
          {completionMessage}
        </p>
      )}

      <div className="space-y-6" aria-busy={anyLoading}>
      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard>
          <SectionHeading
            title="نسخه منتشرشده جاری"
            detail="نسخه‌ای که اکنون در فروشگاه نمایش داده می‌شود."
          />
          {currentPublication.loading && !currentPublication.data ? (
            <Loading
              compact
              announce={!initialLoading}
              label="در حال بارگذاری نسخه منتشرشده…"
            />
          ) : currentPublication.error ? (
            <SectionError
              error={currentPublication.error}
              onRetry={currentPublication.reload}
            />
          ) : (
            <>
              <Refreshing visible={currentPublication.loading} />
              <PublicationSummary
                publication={currentPublication.data}
                emptyTitle="هنوز نسخه‌ای منتشر نشده است"
                emptyDescription="با ویرایش صفحه اصلی و انتشار، نخستین نسخه عمومی ساخته می‌شود."
                timestampLabel="زمان انتشار"
                timestamp={currentPublication.data?.publishedAt ?? null}
              />
            </>
          )}
        </TableCard>

        <TableCard>
          <SectionHeading
            title="انتشار زمان‌بندی‌شده"
            detail={
              scheduledQualified
                ? 'نزدیک‌ترین زمان‌بندی از میان ۵ نسخه اخیر؛ ممکن است زمان‌بندی‌های دیگری نیز وجود داشته باشد.'
                : 'نزدیک‌ترین زمان‌بندی بر اساس نسخه‌های زمان‌بندی‌شده موجود.'
            }
          />
          {scheduledPublications.loading && !scheduledPublications.data ? (
            <Loading
              compact
              announce={!initialLoading}
              label="در حال بارگذاری انتشارهای زمان‌بندی‌شده…"
            />
          ) : scheduledPublications.error ? (
            <SectionError
              error={scheduledPublications.error}
              onRetry={scheduledPublications.reload}
            />
          ) : scheduledItems.length === 0 ? (
            <EmptyState
              size="compact"
              title="انتشار زمان‌بندی‌شده‌ای وجود ندارد"
              description="از ویرایشگر صفحه اصلی می‌توانید نسخه بعدی را زمان‌بندی کنید."
              actions={
                <LinkButton to="/merchandising/homepage" outline>
                  زمان‌بندی از ویرایشگر
                </LinkButton>
              }
            />
          ) : (
            <div className="space-y-3">
              <Refreshing visible={scheduledPublications.loading} />
              <p className="text-xs text-muted">
                {scheduledPublications.data?.total.toLocaleString('fa-IR')} نسخه
                زمان‌بندی‌شده ثبت شده است.
              </p>
              <PublicationSummary
                publication={scheduled.publication}
                emptyTitle="انتشار زمان‌بندی‌شده‌ای وجود ندارد"
                emptyDescription="از ویرایشگر صفحه اصلی می‌توانید نسخه بعدی را زمان‌بندی کنید."
                timestampLabel="زمان زمان‌بندی"
                timestamp={scheduled.publication?.publishAt ?? null}
              />
              {scheduled.invalidDate && (
                <Text className="text-xs text-warning">
                  زمان انتشار این نسخه معتبر نیست و نمایش داده نمی‌شود.
                </Text>
              )}
            </div>
          )}
        </TableCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <TableCard>
          <SectionHeading
            title="پیش‌نویس صفحه اصلی"
            detail="وضعیت نسخه ذخیره‌شده و اعتبارسنجی فعلی آن."
            action={
              <LinkButton to="/merchandising/homepage" plain>
                ویرایش صفحه اصلی
              </LinkButton>
            }
          />
          {draft.loading && !draft.data ? (
            <Loading
              compact
              announce={!initialLoading}
              label="در حال بارگذاری پیش‌نویس صفحه اصلی…"
            />
          ) : draft.error ? (
            <SectionError error={draft.error} onRetry={draft.reload} />
          ) : !draft.data ? (
            <EmptyState
              size="compact"
              title="پیش‌نویس در دسترس نیست"
              description="وضعیت پیش‌نویس صفحه اصلی دریافت نشد."
              actions={
                <LinkButton to="/merchandising/homepage" outline>
                  باز کردن ویرایشگر
                </LinkButton>
              }
            />
          ) : (
            <div className="space-y-4">
              <Refreshing visible={draft.loading} />
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <dt className="text-xs text-muted">نسخه پیش‌نویس</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {draft.data.revision.toLocaleString('fa-IR')}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <dt className="text-xs text-muted">نسخه ساختار</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {draft.data.schemaVersion.toLocaleString('fa-IR')}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <dt className="text-xs text-muted">تعداد بخش‌ها</dt>
                  <dd className="font-semibold tabular-nums text-foreground">
                    {draft.data.sections.length.toLocaleString('fa-IR')}
                  </dd>
                </div>
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <dt className="text-xs text-muted">آخرین ذخیره</dt>
                  <dd className="text-xs text-foreground" dir="ltr">
                    {formatTehranDateTime(draft.data.updatedAt)}
                  </dd>
                </div>
              </dl>

              {draft.data.sections.length === 0 && (
                <EmptyState
                  size="compact"
                  title="پیش‌نویس صفحه اصلی خالی است"
                  description="هنوز بخشی به پیش‌نویس اضافه نشده است."
                  actions={
                    <LinkButton to="/merchandising/homepage" outline>
                      شروع ویرایش
                    </LinkButton>
                  }
                />
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    آمادگی انتشار
                  </span>
                  {draftValidation.loading ? (
                    <StatusBadge tone="info">در حال اعتبارسنجی</StatusBadge>
                  ) : draftValidation.error ? (
                    <StatusBadge tone="neutral">اعتبارسنجی نامشخص</StatusBadge>
                  ) : readiness ? (
                    <StatusBadge tone={readiness.tone}>
                      {readiness.label}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">اعتبارسنجی نامشخص</StatusBadge>
                  )}
                </div>
                {draftValidation.error ? (
                  <div className="space-y-2">
                    <InlineError message={translateApiError(draftValidation.error)} />
                    <Button outline onClick={draftValidation.reload}>
                      تلاش مجدد اعتبارسنجی
                    </Button>
                  </div>
                ) : readiness?.blockingReason ? (
                  <Text className="text-xs text-muted">
                    {readiness.blockingReason}
                  </Text>
                ) : null}
              </div>
            </div>
          )}
        </TableCard>

        <TableCard>
          <SectionHeading
            title="دسترسی سریع"
            detail="ورود به بخش‌های اصلی بازاریابی؛ این میان‌برها فقط ناوبری هستند."
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <LinkButton to="/merchandising/homepage" outline className="w-full">
              صفحه اصلی
            </LinkButton>
            <LinkButton
              to="/merchandising/publications"
              outline
              className="w-full"
            >
              انتشارها
            </LinkButton>
            <LinkButton
              to="/merchandising/campaigns"
              outline
              className="w-full"
            >
              کمپین‌ها
            </LinkButton>
            <LinkButton to="/merchandising/media" outline className="w-full">
              کتابخانه رسانه
            </LinkButton>
          </div>
          {canAdmin && (
            <div className="mt-5 space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold text-muted">میان‌برهای مدیر</p>
              <Link
                className="focus-ring block text-sm font-medium text-primary hover:text-primary-dark"
                to="/merchandising/homepage"
              >
                انتشار فوری یا زمان‌بندی (در ویرایشگر صفحه اصلی)
              </Link>
              <Link
                className="focus-ring block text-sm font-medium text-primary hover:text-primary-dark"
                to="/merchandising/publications"
              >
                پیگیری انتشارها و تاریخچه نسخه‌ها
              </Link>
            </div>
          )}
        </TableCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard>
          <SectionHeading
            title="کمپین‌های اخیر"
            detail={
              campaigns.data
                ? `${campaigns.data.total.toLocaleString('fa-IR')} کمپین ثبت شده است.`
                : undefined
            }
            action={
              <LinkButton to="/merchandising/campaigns" plain>
                مشاهده همه
              </LinkButton>
            }
          />
          {campaigns.loading && !campaigns.data ? (
            <Loading
              compact
              announce={!initialLoading}
              label="در حال بارگذاری کمپین‌ها…"
            />
          ) : campaigns.error ? (
            <SectionError error={campaigns.error} onRetry={campaigns.reload} />
          ) : !campaigns.data || campaigns.data.items.length === 0 ? (
            <EmptyState
              size="compact"
              title="هنوز کمپینی ثبت نشده است"
              description="نخستین کمپین بازاریابی را ایجاد کنید."
              actions={
                <LinkButton to="/merchandising/campaigns/new" color="primary">
                  ایجاد کمپین
                </LinkButton>
              }
            />
          ) : (
            <div className="space-y-2">
              <Refreshing visible={campaigns.loading} />
              <CampaignTable items={campaigns.data.items} />
            </div>
          )}
        </TableCard>

        <TableCard>
          <SectionHeading
            title="رسانه‌های اخیر"
            detail={
              media.data
                ? `${media.data.total.toLocaleString('fa-IR')} رسانه در کتابخانه ثبت شده است.`
                : undefined
            }
            action={
              <LinkButton to="/merchandising/media" plain>
                مشاهده همه
              </LinkButton>
            }
          />
          {media.loading && !media.data ? (
            <Loading
              compact
              announce={!initialLoading}
              label="در حال بارگذاری رسانه‌ها…"
            />
          ) : media.error ? (
            <SectionError error={media.error} onRetry={media.reload} />
          ) : !media.data || media.data.items.length === 0 ? (
            <EmptyState
              size="compact"
              title="کتابخانه رسانه خالی است"
              description="نخستین تصویر کمپین یا صفحه اصلی را در کتابخانه بارگذاری کنید."
              actions={
                <LinkButton to="/merchandising/media" outline>
                  باز کردن کتابخانه رسانه
                </LinkButton>
              }
            />
          ) : (
            <div className="space-y-2">
              <Refreshing visible={media.loading} />
              <MediaTable items={media.data.items} />
            </div>
          )}
        </TableCard>
      </div>
      </div>
    </div>
  )
}
