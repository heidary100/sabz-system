import { useState } from 'react'
import type { MerchMediaSummaryDto } from '@sabz/types'
import { Eye, ImagePlus, Images, Search, Trash2 } from 'lucide-react'
import { useMerchMediaList } from '../../hooks/use-merch-media-list'
import type { MerchMediaPublishedFilter } from '../../hooks/use-merch-media-list'
import {
  formatMerchMediaDimensions,
} from '../../lib/merchandising-media'
import { translateApiError } from '../../lib/error-messages'
import { formatDate, formatFileSize } from '../../lib/format'
import { Button } from '../../components/catalyst/button'
import { Field, Label } from '../../components/catalyst/fieldset'
import { Input, InputGroup } from '../../components/catalyst/input'
import { Select } from '../../components/catalyst/select'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { TableCard } from '../../components/ui/table-card'
import { TablePagination } from '../../components/ui/table-pagination'
import { MerchMediaDeleteDialog } from '../../components/merchandising/merch-media-delete-dialog'
import { MerchMediaDetailDialog } from '../../components/merchandising/merch-media-detail-dialog'
import { MerchMediaStatusBadge } from '../../components/merchandising/merch-media-status-badge'
import { MerchMediaThumbnail } from '../../components/merchandising/merch-media-thumbnail'
import { MerchMediaUploadDialog } from '../../components/merchandising/merch-media-upload-dialog'

export function MerchandisingMediaPage() {
  const {
    search,
    isPublished,
    page,
    limit,
    result,
    loading,
    error,
    setSearch,
    setPublished,
    setPage,
    setLimit,
    refetch,
  } = useMerchMediaList()

  const [uploadOpen, setUploadOpen] = useState(false)
  const [previewMedia, setPreviewMedia] = useState<MerchMediaSummaryDto | null>(
    null,
  )
  const [deleteMedia, setDeleteMedia] = useState<MerchMediaSummaryDto | null>(
    null,
  )
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const hasFilters = search.trim() !== '' || isPublished !== ''
  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  const clearFilters = (): void => {
    setSearch('')
    setPublished('')
  }

  const handleUploadSuccess = (media: MerchMediaSummaryDto): void => {
    setUploadOpen(false)
    setStatusMessage(
      `رسانه «${media.originalName}» بارگذاری شد و در وضعیت منتشرنشده است.`,
    )
    if (page === 1) {
      void refetch()
    } else {
      setPage(1)
    }
  }

  const handleAltChanged = (): void => {
    setStatusMessage('متن جایگزین ذخیره شد.')
    void refetch()
  }

  const handleDeleted = (media: MerchMediaSummaryDto): void => {
    setDeleteMedia(null)
    setStatusMessage(`رسانه «${media.originalName}» از کتابخانه حذف شد.`)
    void refetch()
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="کتابخانه رسانه"
        subtitle="رسانه‌های بازاریابی؛ بارگذاری به‌تنهایی به معنی انتشار عمومی نیست."
        actions={
          <Button color="primary" onClick={() => setUploadOpen(true)}>
            <ImagePlus data-slot="icon" />
            بارگذاری رسانه
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <Field>
          <Label htmlFor="merch-media-search">جستجو</Label>
          <InputGroup>
            <Search data-slot="icon" aria-hidden="true" />
            <Input
              id="merch-media-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setStatusMessage(null)
              }}
              placeholder="نام فایل یا متن جایگزین"
            />
          </InputGroup>
        </Field>
        <Field>
          <Label htmlFor="merch-media-published">وضعیت انتشار</Label>
          <Select
            id="merch-media-published"
            value={isPublished}
            onChange={(event) => {
              setPublished(
                event.target.value as MerchMediaPublishedFilter,
              )
              setStatusMessage(null)
            }}
          >
            <option value="">همه وضعیت‌ها</option>
            <option value="false">منتشرنشده</option>
            <option value="true">منتشرشده</option>
          </Select>
        </Field>
      </div>

      {statusMessage && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {statusMessage}
        </p>
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری رسانه‌ها…" />
      ) : error ? (
        <ErrorState
          message={translateApiError(error)}
          onRetry={() => void refetch()}
        />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          icon={<Images className="size-6" aria-hidden="true" />}
          title={
            hasFilters
              ? 'رسانه‌ای با این فیلتر پیدا نشد'
              : 'کتابخانه رسانه خالی است'
          }
          description={
            hasFilters
              ? 'عبارت جستجو یا فیلتر وضعیت را تغییر دهید.'
              : 'نخستین تصویر کمپین یا صفحه اصلی را بارگذاری کنید؛ رسانه تازه منتشرنشده می‌ماند.'
          }
          actions={
            hasFilters ? (
              <Button outline onClick={clearFilters}>
                پاک کردن فیلترها
              </Button>
            ) : (
              <Button color="primary" onClick={() => setUploadOpen(true)}>
                <ImagePlus data-slot="icon" />
                بارگذاری نخستین رسانه
              </Button>
            )
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
              limitOptions={[20, 50]}
              onLimitChange={setLimit}
              disabled={loading}
              totalLabel="رسانه"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.items.map((media) => (
                <MediaCard
                  key={media.id}
                  media={media}
                  onPreview={() => setPreviewMedia(media)}
                  onDelete={() => setDeleteMedia(media)}
                />
              ))}
            </div>

            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={limit}
              limitOptions={[20, 50]}
              onLimitChange={setLimit}
              disabled={loading}
              totalLabel="رسانه"
            />
          </TableCard>
        </div>
      )}

      {loading && result && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 py-2"
        >
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
          />
          <span className="text-sm font-medium text-muted">
            در حال به‌روزرسانی…
          </span>
        </div>
      )}

      <MerchMediaUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      <MerchMediaDetailDialog
        open={previewMedia !== null}
        media={previewMedia}
        onClose={() => setPreviewMedia(null)}
        onChanged={handleAltChanged}
      />

      <MerchMediaDeleteDialog
        open={deleteMedia !== null}
        media={deleteMedia}
        onClose={() => setDeleteMedia(null)}
        onDeleted={handleDeleted}
        onConflict={() => {
          setStatusMessage(
            'وضعیت استفاده تغییر کرده بود؛ اطلاعات تازه‌تر بارگذاری شد.',
          )
          void refetch()
        }}
      />
    </div>
  )
}

function MediaCard({
  media,
  onPreview,
  onDelete,
}: {
  media: MerchMediaSummaryDto
  onPreview: () => void
  onDelete: () => void
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-[4/3] bg-surface-strong">
        <button
          type="button"
          onClick={onPreview}
          aria-label={`مشاهده رسانه ${media.originalName}`}
          className="focus-ring block size-full"
        >
          <MerchMediaThumbnail
            mediaId={media.id}
            alt={media.altFa ?? media.originalName}
          />
        </button>
        <div className="pointer-events-none absolute end-2 top-2">
          <MerchMediaStatusBadge status={media.status} />
        </div>
      </div>
      <div className="space-y-2 p-3">
        <p
          dir="ltr"
          className="truncate text-left text-sm font-medium text-foreground"
          title={media.originalName}
        >
          {media.originalName}
        </p>
        <p className="line-clamp-2 min-h-10 text-xs text-muted">
          {media.altFa || 'بدون متن جایگزین'}
        </p>
        <p className="text-xs text-muted">
          {formatFileSize(media.sizeBytes)} ·{' '}
          {formatMerchMediaDimensions(media.width, media.height)} ·{' '}
          {formatDate(media.createdAt)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button outline onClick={onPreview}>
            <Eye data-slot="icon" />
            مشاهده و ویرایش
          </Button>
          <Button outline onClick={onDelete}>
            <Trash2 data-slot="icon" />
            حذف
          </Button>
        </div>
      </div>
    </article>
  )
}
