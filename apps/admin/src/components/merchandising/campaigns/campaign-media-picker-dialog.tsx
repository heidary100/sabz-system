import { useCallback, useEffect, useRef, useState } from 'react'
import type { MerchMediaListResponse, MerchMediaSummaryDto } from '@sabz/types'
import { Search } from 'lucide-react'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Input, InputGroup } from '../../catalyst/input'
import { Text } from '../../catalyst/text'
import { EmptyState } from '../../ui/empty-state'
import { ErrorState } from '../../ui/error-state'
import { Loading } from '../../ui/loading'
import { TablePagination } from '../../ui/table-pagination'
import { translateApiError } from '../../../lib/error-messages'
import { formatFileSize } from '../../../lib/format'
import { listMerchMedia } from '../../../services/merchandising'
import { MerchMediaStatusBadge } from '../merch-media-status-badge'
import { MerchMediaThumbnail } from '../merch-media-thumbnail'

const PAGE_SIZE = 20

export function CampaignMediaPickerDialog({
  open,
  maxReached,
  onPick,
  onClose,
}: {
  open: boolean
  maxReached: boolean
  onPick: (media: MerchMediaSummaryDto) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<MerchMediaListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (open) {
      setSearch('')
      setPage(1)
    }
  }, [open])

  const refetch = useCallback(async () => {
    if (!open) {
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listMerchMedia({
        page,
        limit: PAGE_SIZE,
        q: search.trim() || undefined,
      })
      if (seq === requestSeq.current) {
        setResult(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setResult(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [open, page, search])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <Alert open={open} onClose={onClose} size="4xl">
      <AlertTitle>انتخاب رسانه</AlertTitle>
      <AlertDescription>
        رسانه‌های منتشرنشده نیز برای انتساب مجازند؛ انتشار عمومی فقط از مسیر
        انتشار صفحه اصلی انجام می‌شود.
      </AlertDescription>
      <AlertBody>
        <div className="mb-4">
          <InputGroup>
            <Search data-slot="icon" aria-hidden="true" />
            <Input
              type="search"
              aria-label="جستجوی رسانه"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="نام فایل یا متن جایگزین"
            />
          </InputGroup>
        </div>

        {loading && !result ? (
          <Loading compact label="در حال بارگذاری رسانه‌ها…" />
        ) : error ? (
          <ErrorState
            size="compact"
            message={translateApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            size="compact"
            title="رسانه‌ای پیدا نشد"
            description="از کتابخانه رسانه، نخستین تصویر را بارگذاری کنید."
          />
        ) : (
          <>
            <TablePagination
              position="top"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="رسانه"
            />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {result.items.map((media) => (
                <li
                  key={media.id}
                  className="flex gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  <div className="size-24 shrink-0 overflow-hidden rounded-lg bg-surface-strong">
                    <MerchMediaThumbnail
                      mediaId={media.id}
                      alt={media.altFa ?? media.originalName}
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <MerchMediaStatusBadge status={media.status} />
                    </div>
                    <p
                      dir="ltr"
                      className="truncate text-start text-xs font-medium text-foreground"
                      title={media.originalName}
                    >
                      {media.originalName}
                    </p>
                    <p className="text-xs text-muted">
                      {formatFileSize(media.sizeBytes)}
                      {media.width && media.height
                        ? ` · ${media.width}×${media.height}`
                        : ''}
                    </p>
                    <Button
                      outline
                      disabled={maxReached}
                      onClick={() => onPick(media)}
                    >
                      {maxReached ? 'محدودیت تکمیل است' : 'افزودن'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="رسانه"
            />
          </>
        )}
        <Text className="mt-3 text-xs text-muted">
          حداکثر ۴ رسانه در هر کمپین. جایگاه، نقطه کانونی و متن جایگزین پس از
          افزودن تنظیم می‌شوند.
        </Text>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose}>
          بستن
        </Button>
      </AlertActions>
    </Alert>
  )
}
