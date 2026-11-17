import { useCallback, useEffect, useRef, useState } from 'react'
import type { PaginatedResult, ProductSummary } from '@sabz/types'
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
import { listProducts } from '../../../services/products'

const PAGE_SIZE = 20

export function CampaignProductPickerDialog({
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
  onPick: (product: ProductSummary) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<PaginatedResult<ProductSummary> | null>(
    null,
  )
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
      const data = await listProducts({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        status: 'PUBLISHED',
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
      <AlertTitle>انتخاب محصول</AlertTitle>
      <AlertDescription>
        فقط محصولات منتشرشده قابل انتخاب‌اند. ترتیب انتخاب در کمپین حفظ می‌شود.
      </AlertDescription>
      <AlertBody>
        <div className="mb-4">
          <InputGroup>
            <Search data-slot="icon" aria-hidden="true" />
            <Input
              type="search"
              aria-label="جستجوی محصول"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="جستجو در نام یا شناسه محصول"
            />
          </InputGroup>
        </div>

        {loading && !result ? (
          <Loading compact label="در حال بارگذاری محصولات…" />
        ) : error ? (
          <ErrorState
            size="compact"
            message={translateApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            size="compact"
            title="محصولی پیدا نشد"
            description="عبارت جستجو را تغییر دهید."
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
              totalLabel="محصول"
            />
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>محصول</TableHeader>
                  <TableHeader>برند / دسته</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((product) => {
                  const selected = selectedIds.includes(product.id)
                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {product.name}
                        </p>
                        <p dir="ltr" className="text-xs text-muted">
                          {product.slug}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted">
                        {[product.brand?.name, product.category.name]
                          .filter(Boolean)
                          .join(' / ') || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          outline
                          disabled={selected || maxReached}
                          onClick={() => onPick(product)}
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
              totalLabel="محصول"
            />
          </>
        )}
        <Text className="mt-3 text-xs text-muted">
          حداکثر ۱۲ محصول در هر کمپین.
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
