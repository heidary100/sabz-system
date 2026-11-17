import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrandSummary, PaginatedResult } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../catalyst/table'
import { Text } from '../../catalyst/text'
import { EmptyState } from '../../ui/empty-state'
import { ErrorState } from '../../ui/error-state'
import { Loading } from '../../ui/loading'
import { TablePagination } from '../../ui/table-pagination'
import { translateApiError } from '../../../lib/error-messages'
import { listBrands } from '../../../services/brands'

const PAGE_SIZE = 20

export function CampaignBrandPickerDialog({
  open,
  selectedIds,
  maxReached,
  pickLabel = 'افزودن',
  onPick,
  onClose,
}: {
  open: boolean
  selectedIds: string[]
  maxReached: boolean
  pickLabel?: string
  onPick: (brand: BrandSummary) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedResult<BrandSummary> | null>(
    null,
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (open) {
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
      const data = await listBrands({ page, limit: PAGE_SIZE })
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
  }, [open, page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <Alert open={open} onClose={onClose} size="3xl">
      <AlertTitle>انتخاب برند</AlertTitle>
      <AlertDescription>
        فهرست برندها صفحه‌بندی می‌شود. جستجوی سروری برای برندها در دسترس نیست.
      </AlertDescription>
      <AlertBody>
        {loading && !result ? (
          <Loading compact label="در حال بارگذاری برندها…" />
        ) : error ? (
          <ErrorState
            size="compact"
            message={translateApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            size="compact"
            title="برندی پیدا نشد"
            description="ابتدا برندها را در بخش کاتالوگ بسازید."
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
              totalLabel="برند"
            />
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>برند</TableHeader>
                  <TableHeader>شناسه</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((brand) => {
                  const selected = selectedIds.includes(brand.id)
                  return (
                    <TableRow key={brand.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {brand.name}
                        </p>
                        {brand.nameEn && (
                          <p dir="ltr" className="text-xs text-muted">
                            {brand.nameEn}
                          </p>
                        )}
                      </TableCell>
                      <TableCell dir="ltr" className="text-muted">
                        {brand.slug}
                      </TableCell>
                      <TableCell>
                        <Button
                          outline
                          disabled={selected || maxReached}
                          onClick={() => onPick(brand)}
                        >
                          {selected
                            ? 'افزوده‌شده'
                            : maxReached
                              ? 'محدودیت تکمیل است'
                              : pickLabel}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="برند"
            />
          </>
        )}
        <Text className="mt-3 text-xs text-muted">
          حداکثر ۵ برند در هر کمپین. برای یافتن برندهای صفحه‌های بعد از
          صفحه‌بندی استفاده کنید.
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
