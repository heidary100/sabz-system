import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, RefreshCw } from 'lucide-react'
import type { InventoryItemSummary, InventoryStockStatus } from '@sabz/types'
import { useInventoryList } from '../hooks/use-inventory-list'
import { useWarehouseOptions } from '../hooks/use-warehouse-options'
import { translateApiError } from '../lib/error-messages'
import {
  INVENTORY_STOCK_STATUS_LABELS,
  INVENTORY_STOCK_STATUS_ORDER,
} from '../lib/inventory-labels'
import { pageNumbers } from '../lib/pagination'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../components/ui/pagination'
import { Text } from '../components/catalyst/text'
import { InventoryStockStatusBadge } from '../components/inventory/inventory-stock-status-badge'
import { ReceiveStockDialog } from '../components/inventory/receive-stock-dialog'
import { AdjustInventoryDialog } from '../components/inventory/adjust-inventory-dialog'
import { ReserveInventoryDialog } from '../components/inventory/reserve-inventory-dialog'

const SEARCH_DEBOUNCE_MS = 300

type MutationTarget = { mode: 'receive' | 'adjust' | 'reserve'; item: InventoryItemSummary }

export function InventoryPage() {
  const {
    search,
    warehouseId,
    stockStatus,
    page,
    limit,
    result,
    loading,
    error,
    setSearch,
    setWarehouseId,
    setStockStatus,
    setPage,
    clearFilters,
    refetch,
  } = useInventoryList()

  const { warehouses } = useWarehouseOptions()
  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, setSearch])

  const [target, setTarget] = useState<MutationTarget | null>(null)

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const hasActiveFilter = search.trim() !== '' || warehouseId !== '' || stockStatus !== ''

  const handleMutationSuccess = (): void => {
    setTarget(null)
    void refetch()
  }

  const handleMutationConflict = (): void => {
    void refetch()
  }

  const handleClearFilters = (): void => {
    setSearchInput('')
    clearFilters()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="موجودی"
        actions={
          <>
            <Link
              to="/inventory/movements"
              className="text-sm font-medium text-primary hover:underline"
            >
              تاریخچه موجودی
            </Link>
            <Link
              to="/inventory/reservations"
              className="text-sm font-medium text-primary hover:underline"
            >
              رزروها
            </Link>
            <Button outline onClick={() => void refetch()} disabled={loading}>
              <RefreshCw data-slot="icon" />
              به‌روزرسانی
            </Button>
          </>
        }
      />

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2">
          <Label>جستجو</Label>
          <Input
            type="search"
            name="search"
            placeholder="جستجو با SKU یا نام واریانت…"
            maxLength={64}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>انبار</Label>
          <Select
            name="warehouseId"
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="">همه</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>وضعیت موجودی</Label>
          <Select
            name="stockStatus"
            value={stockStatus}
            onChange={(event) =>
              setStockStatus(event.target.value as InventoryStockStatus | '')
            }
          >
            <option value="">همه</option>
            {INVENTORY_STOCK_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {INVENTORY_STOCK_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="موجودی یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها موجودی ثبت نشده است.'
              : 'هنوز موجودی برای هیچ واریانتی ثبت نشده است.'
          }
          icon={<Boxes className="size-6" />}
          actions={
            hasActiveFilter ? (
              <Button outline onClick={handleClearFilters}>
                حذف فیلترها
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>SKU</TableHeader>
                <TableHeader>نام واریانت</TableHeader>
                <TableHeader>انبار</TableHeader>
                <TableHeader>موجودی در دست</TableHeader>
                <TableHeader>رزرو شده</TableHeader>
                <TableHeader>قابل عرضه</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell dir="ltr" className="font-medium text-foreground">
                    {item.variant.sku}
                  </TableCell>
                  <TableCell className="text-muted">
                    <Link
                      to={`/inventory/variants/${item.variant.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.variant.name ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted">
                    <Link
                      to={`/inventory/warehouses/${item.warehouse.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.warehouse.name}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-muted">
                    {item.quantityOnHand}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-muted">
                    {item.quantityReserved}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-muted">
                    {item.available}
                  </TableCell>
                  <TableCell>
                    <InventoryStockStatusBadge status={item.stockStatus} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button outline onClick={() => setTarget({ mode: 'receive', item })}>
                        دریافت موجودی
                      </Button>
                      <Button outline onClick={() => setTarget({ mode: 'adjust', item })}>
                        اصلاح موجودی
                      </Button>
                      <Button outline onClick={() => setTarget({ mode: 'reserve', item })}>
                        رزرو
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی موجودی">
              <PaginationPrevious
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
              />
              <PaginationList>
                {pageNumbers(page, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <PaginationGap key={`gap-${index}`} />
                  ) : (
                    <PaginationPage
                      key={item}
                      current={item === page}
                      disabled={loading}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </PaginationPage>
                  ),
                )}
              </PaginationList>
              <PaginationNext
                disabled={page >= totalPages || loading}
                onClick={() => setPage(page + 1)}
              />
            </Pagination>
          </div>
        </TableCard>
      )}

      {loading && result && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          <span className="text-sm font-medium text-muted">در حال بارگذاری…</span>
        </div>
      )}

      <Text className="text-xs text-muted">
        {result ? `مجموع: ${result.total} مورد · ${limit} مورد در هر صفحه` : ''}
      </Text>

      <ReceiveStockDialog
        open={target?.mode === 'receive'}
        variant={target?.mode === 'receive' ? target.item.variant : null}
        warehouse={target?.mode === 'receive' ? target.item.warehouse : null}
        onClose={() => setTarget(null)}
        onSuccess={handleMutationSuccess}
        onConflict={handleMutationConflict}
      />

      <AdjustInventoryDialog
        open={target?.mode === 'adjust'}
        variant={target?.mode === 'adjust' ? target.item.variant : null}
        warehouse={target?.mode === 'adjust' ? target.item.warehouse : null}
        currentQuantity={target?.mode === 'adjust' ? target.item.quantityOnHand : null}
        onClose={() => setTarget(null)}
        onSuccess={handleMutationSuccess}
        onConflict={handleMutationConflict}
      />

      <ReserveInventoryDialog
        open={target?.mode === 'reserve'}
        variant={target?.mode === 'reserve' ? target.item.variant : null}
        warehouse={target?.mode === 'reserve' ? target.item.warehouse : null}
        available={target?.mode === 'reserve' ? target.item.available : null}
        onClose={() => setTarget(null)}
        onSuccess={handleMutationSuccess}
        onConflict={handleMutationConflict}
      />
    </div>
  )
}