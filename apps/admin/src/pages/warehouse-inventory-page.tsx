import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { InventoryItemSummary } from '@sabz/types'
import { useWarehouseInventory } from '../hooks/use-warehouse-inventory'
import { translateApiError } from '../lib/error-messages'
import { Button } from '../components/catalyst/button'
import { Heading } from '../components/catalyst/heading'
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

type MutationTarget = { mode: 'receive' | 'adjust'; item: InventoryItemSummary }

function pageNumbers(current: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages: (number | 'gap')[] = [1]
  if (current > 3) {
    pages.push('gap')
  }
  for (let page = Math.max(2, current - 1); page <= Math.min(totalPages - 1, current + 1); page++) {
    pages.push(page)
  }
  if (current < totalPages - 2) {
    pages.push('gap')
  }
  pages.push(totalPages)
  return pages
}

export function WarehouseInventoryPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()
  const { page, limit, result, loading, error, setPage, refetch } =
    useWarehouseInventory(warehouseId ?? '')

  const [target, setTarget] = useState<MutationTarget | null>(null)

  const firstRow = result && result.items.length > 0 ? result.items[0] : null
  const warehouseRef = firstRow?.warehouse ?? null

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  if (loading && !result) {
    return <Loading label="در حال بارگذاری موجودی انبار…" />
  }

  if (error && !result) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link to="/inventory" className="text-sm font-medium text-primary hover:underline">
            بازگشت به موجودی
          </Link>
        </div>
      </div>
    )
  }

  const handleMutationSuccess = (): void => {
    setTarget(null)
    void refetch()
  }

  const handleMutationConflict = (): void => {
    void refetch()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Link to="/inventory" className="text-sm font-medium text-primary hover:underline">
          بازگشت به موجودی
        </Link>
        <Heading level={1}>
          {warehouseRef ? `موجودی انبار «${warehouseRef.name}»` : 'موجودی انبار'}
        </Heading>
        {warehouseRef && (
          <Text className="text-sm text-dust-200">
            کد انبار: <span dir="ltr" className="font-medium text-zinc-950">{warehouseRef.code}</span>
          </Text>
        )}
      </div>

      {!result || result.items.length === 0 ? (
        <EmptyState
          title="موجودی یافت نشد"
          description={
            warehouseRef
              ? `در انبار «${warehouseRef.name}» موجودی ثبت نشده است.`
              : 'در این انبار موجودی ثبت نشده است.'
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-white p-4">
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>SKU</TableHeader>
                <TableHeader>نام واریانت</TableHeader>
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
                  <TableCell dir="ltr" className="font-medium text-zinc-950">
                    {item.variant.sku}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    <Link
                      to={`/inventory/variants/${item.variant.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {item.variant.name ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {item.quantityOnHand}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {item.quantityReserved}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
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
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی موجودی انبار">
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
        </div>
      )}

      {loading && result && (
        <div className="flex items-center justify-center gap-3 py-4" role="status">
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          <span className="text-sm font-medium text-dust-200">در حال بارگذاری…</span>
        </div>
      )}

      <Text className="text-xs text-dust-200">
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
    </div>
  )
}