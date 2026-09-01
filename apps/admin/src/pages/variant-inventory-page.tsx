import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Boxes } from 'lucide-react'
import type { InventoryItemSummary } from '@sabz/types'
import { useVariantInventory } from '../hooks/use-variant-inventory'
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
import { TableCard } from '../components/ui/table-card'
import { Text } from '../components/catalyst/text'
import { InventoryStockStatusBadge } from '../components/inventory/inventory-stock-status-badge'
import { ReceiveStockDialog } from '../components/inventory/receive-stock-dialog'
import { AdjustInventoryDialog } from '../components/inventory/adjust-inventory-dialog'
import { ReserveInventoryDialog } from '../components/inventory/reserve-inventory-dialog'

type MutationTarget = { mode: 'receive' | 'adjust' | 'reserve'; item: InventoryItemSummary }

export function VariantInventoryPage() {
  const { variantId } = useParams<{ variantId: string }>()
  const { rows, loading, error, refetch } = useVariantInventory(variantId ?? '')

  const [target, setTarget] = useState<MutationTarget | null>(null)

  const firstRow = rows && rows.length > 0 ? rows[0] : null
  const variantRef = firstRow?.variant ?? null

  if (loading && !rows) {
    return <Loading label="در حال بارگذاری موجودی واریانت…" />
  }

  if (error && !rows) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="glass flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link
            to="/inventory"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ArrowRight className="size-4" data-slot="icon" />
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
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowRight className="size-4" data-slot="icon" />
          بازگشت به موجودی
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Heading level={1}>موجودی واریانت</Heading>
            {variantRef && (
              <Text className="text-sm text-muted">
                <span dir="ltr" className="font-medium text-foreground">
                  {variantRef.sku}
                </span>
                {variantRef.name ? ` · ${variantRef.name}` : ''}
              </Text>
            )}
          </div>
          {variantId && (
            <Link
              to={`/inventory/movements?variantId=${encodeURIComponent(variantId)}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              تاریخچه این واریانت
            </Link>
          )}
          {variantId && (
            <Link
              to={`/inventory/reservations?variantId=${encodeURIComponent(variantId)}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              رزروهای این واریانت
            </Link>
          )}
        </div>
      </div>

      {!rows || rows.length === 0 ? (
        <EmptyState
          title="موجودی ثبت نشده"
          description={
            variantRef
              ? `برای واریانت ${variantRef.sku} در هیچ انبار فعالی موجودی ثبت نشده است.`
              : 'برای این واریانت در هیچ انبار فعالی موجودی ثبت نشده است.'
          }
          icon={<Boxes className="size-6" />}
        />
      ) : (
        <TableCard>
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>انبار</TableHeader>
                <TableHeader>موجودی در دست</TableHeader>
                <TableHeader>رزرو شده</TableHeader>
                <TableHeader>قابل عرضه</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
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
        </TableCard>
      )}

      {loading && rows && (
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