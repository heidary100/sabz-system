import { useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  HomepagePublicationDto,
  HomepagePublicationStatus,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import { Button } from '../../components/catalyst/button'
import { Field, Label } from '../../components/catalyst/fieldset'
import { Select } from '../../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/catalyst/table'
import { Text } from '../../components/catalyst/text'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { LinkButton } from '../../components/ui/link-button'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { StatusBadge } from '../../components/ui/status-badge'
import { TableCard } from '../../components/ui/table-card'
import { TablePagination } from '../../components/ui/table-pagination'
import { HomepagePublicationCancelDialog } from '../../components/merchandising/homepage/homepage-publication-cancel-dialog'
import { HomepagePublicationRollbackDialog } from '../../components/merchandising/homepage/homepage-publication-rollback-dialog'
import { useAuth } from '../../auth/auth-provider'
import { useHomepagePublicationList } from '../../hooks/use-homepage-publication-list'
import type { HomepagePublicationStatusFilter } from '../../hooks/use-homepage-publication-list'
import { translateApiError } from '../../lib/error-messages'
import {
  HOMEPAGE_PUBLICATION_STATUS_LABELS,
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
} from '../../lib/merchandising-status'
import { formatTehranDateTime } from '../../lib/tehran-time'

const STATUS_OPTIONS: HomepagePublicationStatus[] = [
  'SCHEDULED',
  'PUBLISHED',
  'SUPERSEDED',
  'CANCELLED',
]

export function MerchandisingPublicationsPage() {
  const { user } = useAuth()
  const canCancel = user?.roles.includes('ADMIN') ?? false
  const {
    status,
    page,
    limit,
    result,
    loading,
    error,
    setStatus,
    setPage,
    setLimit,
    refetch,
  } = useHomepagePublicationList()
  const [cancelTarget, setCancelTarget] =
    useState<HomepagePublicationSummaryDto | null>(null)
  const [rollbackTarget, setRollbackTarget] =
    useState<HomepagePublicationSummaryDto | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1
  const currentPublishedId =
    result?.items.find((item) => item.status === 'PUBLISHED')?.id ?? null

  const handleCancelled = (publication: HomepagePublicationDto): void => {
    setMessage(
      `انتشار زمان‌بندی‌شده نسخه ${publication.version.toLocaleString(
        'fa-IR',
      )} لغو شد؛ محتوای عمومی فروشگاه تغییر نکرد.`,
    )
    setActionError(null)
    setCancelTarget(null)
    void refetch()
  }

  const handleCancelConflict = (): void => {
    setActionError(
      'وضعیت این انتشار تغییر کرده است؛ فهرست به‌روز شد. جزئیات تعارض را بررسی کنید و سپس گفت‌وگو را ببندید.',
    )
    void refetch()
  }

  const handleRolledBack = (
    publication: HomepagePublicationDto,
    source: HomepagePublicationSummaryDto,
  ): void => {
    setMessage(
      `نسخه ${publication.version.toLocaleString(
        'fa-IR',
      )} از نسخه ${source.version.toLocaleString(
        'fa-IR',
      )} بازگردانی شد و اکنون نسخه منتشرشده جاری است.`,
    )
    setActionError(null)
    setRollbackTarget(null)
    void refetch()
  }

  const handleRollbackConflict = (): void => {
    setActionError(
      'وضعیت انتشار تغییر کرده یا نسخه مبدأ دیگر معتبر نیست؛ فهرست به‌روز شد. جزئیات تعارض را بررسی کنید و سپس گفت‌وگو را ببندید.',
    )
    void refetch()
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="انتشارها"
        subtitle="تاریخچه نسخه‌های صفحه اصلی با صفحه‌بندی سرور؛ زمان‌ها به وقت تهران نمایش داده می‌شوند."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              outline
              onClick={() => void refetch()}
              disabled={loading}
            >
              {loading ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی فهرست'}
            </Button>
            <Link
              to="/merchandising/homepage"
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              ویرایشگر صفحه اصلی
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <Field className="min-w-52">
          <Label htmlFor="publication-status-filter">وضعیت انتشار</Label>
          <Select
            id="publication-status-filter"
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as HomepagePublicationStatusFilter,
              )
            }
          >
            <option value="">همه وضعیت‌ها</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {HOMEPAGE_PUBLICATION_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Text className="pb-2 text-xs text-muted">
          نسخه «منتشرشده» جاری با برچسب جدا مشخص می‌شود. برای تشخیص رویدادهای
          فعال‌سازی، جزئیات هر نسخه را باز کنید؛ فهرست برای هر ردیف درخواست
          حسابرسی جداگانه نمی‌فرستد.
        </Text>
      </div>

      {message && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {message}
        </p>
      )}
      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </p>
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری تاریخچه انتشار…" />
      ) : error ? (
        <ErrorState
          message={translateApiError(error)}
          onRetry={() => void refetch()}
        />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title={
            status === ''
              ? 'هنوز نسخه‌ای منتشر یا زمان‌بندی نشده است'
              : 'نسخه‌ای با این وضعیت پیدا نشد'
          }
          description={
            status === ''
              ? 'پس از انتشار یا زمان‌بندی صفحه اصلی، نسخه‌ها اینجا نمایش داده می‌شوند.'
              : 'فیلتر وضعیت را تغییر دهید یا فهرست را به‌روزرسانی کنید.'
          }
          actions={
            <Button outline onClick={() => void refetch()} disabled={loading}>
              به‌روزرسانی
            </Button>
          }
        />
      ) : (
        <div aria-busy={loading}>
          <TableCard>
            <TablePagination
              position="top"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={limit}
              limitOptions={[20, 50, 100]}
              onLimitChange={setLimit}
              disabled={loading}
              totalLabel="نسخه"
            />
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>نسخه</TableHeader>
                  <TableHeader>وضعیت</TableHeader>
                  <TableHeader>زمان (تهران)</TableHeader>
                  <TableHeader>پیش‌نویس منبع</TableHeader>
                  <TableHeader>یادداشت</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((publication) => (
                  <TableRow key={publication.id}>
                    <TableCell>
                      <Link
                        to={`/merchandising/publications/${publication.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        نسخه {publication.version.toLocaleString('fa-IR')}
                      </Link>
                      <p dir="ltr" className="text-xs text-muted">
                        {publication.id}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge
                          tone={homepagePublicationStatusTone(
                            publication.status,
                          )}
                        >
                          {homepagePublicationStatusLabel(publication.status)}
                        </StatusBadge>
                        {publication.id === currentPublishedId && (
                          <StatusBadge tone="info">نسخه جاری</StatusBadge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      {publication.publishAt && (
                        <p>
                          زمان‌بندی:{' '}
                          {formatTehranDateTime(publication.publishAt)}
                        </p>
                      )}
                      {publication.publishedAt && (
                        <p>
                          انتشار: {formatTehranDateTime(publication.publishedAt)}
                        </p>
                      )}
                      {!publication.publishAt && !publication.publishedAt && (
                        <p>—</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums text-foreground">
                      {publication.sourceDraftRevision.toLocaleString('fa-IR')}
                    </TableCell>
                    <TableCell className="max-w-64 text-xs text-muted">
                      {publication.note ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <LinkButton
                          to={`/merchandising/publications/${publication.id}`}
                          plain
                        >
                          {publication.status === 'SCHEDULED' ||
                          publication.status === 'CANCELLED'
                            ? 'مشاهده و تشخیص'
                            : 'مشاهده'}
                        </LinkButton>
                        {canCancel && publication.status === 'SCHEDULED' && (
                          <Button
                            plain
                            onClick={() => {
                              setActionError(null)
                              setMessage(null)
                              setCancelTarget(publication)
                            }}
                          >
                            لغو
                          </Button>
                        )}
                        {canCancel && publication.status === 'SUPERSEDED' && (
                          <Button
                            plain
                            onClick={() => {
                              setActionError(null)
                              setMessage(null)
                              setRollbackTarget(publication)
                            }}
                          >
                            بازگردانی
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={limit}
              limitOptions={[20, 50, 100]}
              onLimitChange={setLimit}
              disabled={loading}
              totalLabel="نسخه"
            />
          </TableCard>
        </div>
      )}

      <HomepagePublicationCancelDialog
        open={cancelTarget !== null}
        publication={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onCancelled={handleCancelled}
        onConflict={handleCancelConflict}
      />
      <HomepagePublicationRollbackDialog
        open={rollbackTarget !== null}
        publication={rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        onRolledBack={handleRolledBack}
        onConflict={handleRollbackConflict}
      />
    </div>
  )
}
