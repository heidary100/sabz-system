import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Boxes } from 'lucide-react'
import type { InventoryItemSummary } from '@sabz/types'
import { useWarehouseInventory } from '../hooks/use-warehouse-inventory'
import { translateApiError } from '../lib/error-messages'
import { Button } from '../components/catalyst/button'
import { RouteHelpSection } from '../components/ui/page-help'
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
import { ErrorState } from '../components/ui/error-state'
import { TablePagination } from '../components/ui/table-pagination'
import { TableCard } from '../components/ui/table-card'
import { Text } from '../components/catalyst/text'
import { InventoryStockStatusBadge } from '../components/inventory/inventory-stock-status-badge'
import { ReceiveStockDialog } from '../components/inventory/receive-stock-dialog'
import { AdjustInventoryDialog } from '../components/inventory/adjust-inventory-dialog'
import { ReserveInventoryDialog } from '../components/inventory/reserve-inventory-dialog'

type MutationTarget = { mode: 'receive' | 'adjust' | 'reserve'; item: InventoryItemSummary }

export function WarehouseInventoryPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()
  const { page, limit, result, loading, error, setPage, setLimit, refetch } =
    useWarehouseInventory(warehouseId ?? '')

  const [target, setTarget] = useState<MutationTarget | null>(null)

  const firstRow = result && result.items.length > 0 ? result.items[0] : null
  const warehouseRef = firstRow?.warehouse ?? null

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  if (loading && !result) {
    return <Loading label="در حال بارگذاری موجودی انبار…" />
  }

  if (error && !result) {
    return (
      <div className="w-full space-y-6">
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()}>
          <Link
            to="/inventory"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowRight className="size-4" data-slot="icon" />
            بازگشت به موجودی
          </Link>
        </ErrorState>
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
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowRight className="size-4" data-slot="icon" />
          بازگشت به موجودی
        </Link>
        <div className="flex items-center gap-2"><Heading level={1}>
          {warehouseRef ? `موجودی انبار «${warehouseRef.name}»` : 'موجودی انبار'}
        </Heading><RouteHelpSection /></div>
        {warehouseRef && (
          <Text className="text-sm text-muted">
            کد انبار: <span dir="ltr" className="font-medium text-foreground">{warehouseRef.code}</span>
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
          icon={<Boxes className="size-6" />}
        />
      ) : (
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
            totalLabel="قلم"
          />
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>SKU</TableHeader>
                <TableHeader>نام نوع</TableHeader>
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
            totalLabel="قلم"
          />
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