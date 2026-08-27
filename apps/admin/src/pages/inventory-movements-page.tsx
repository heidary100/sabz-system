import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { InventoryMovementType } from '@sabz/types'
import { useInventoryMovements } from '../hooks/use-inventory-movements'
import { useWarehouseOptions } from '../hooks/use-warehouse-options'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import {
  INVENTORY_MOVEMENT_TYPE_LABELS,
  INVENTORY_MOVEMENT_TYPE_ORDER,
} from '../lib/inventory-labels'
import { Badge } from '../components/catalyst/badge'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
import { Heading } from '../components/catalyst/heading'
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
import {
  Pagination,
  PaginationGap,
  PaginationList,
  PaginationNext,
  PaginationPage,
  PaginationPrevious,
} from '../components/ui/pagination'
import { Text } from '../components/catalyst/text'
import { InventoryMovementTypeBadge } from '../components/inventory/inventory-movement-type-badge'

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

function toIsoStartOfDay(date: string): string | undefined {
  if (!date) {
    return undefined
  }
  return new Date(`${date}T00:00:00`).toISOString()
}

function toIsoEndOfDay(date: string): string | undefined {
  if (!date) {
    return undefined
  }
  return new Date(`${date}T23:59:59.999`).toISOString()
}

export function InventoryMovementsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialVariantId = searchParams.get('variantId') ?? ''

  const {
    type,
    warehouseId,
    variantId,
    from,
    to,
    page,
    limit,
    result,
    loading,
    error,
    setType,
    setWarehouseId,
    setVariantId,
    setFrom,
    setTo,
    setPage,
    clearFilters,
    refetch,
  } = useInventoryMovements(initialVariantId)

  const { warehouses } = useWarehouseOptions()

  const [typeInput, setTypeInput] = useState<InventoryMovementType | ''>(type)
  const [warehouseInput, setWarehouseInput] = useState(warehouseId)
  const [fromInput, setFromInput] = useState(from)
  const [toInput, setToInput] = useState(to)

  const invalidDateRange = fromInput !== '' && toInput !== '' && fromInput > toInput
  const hasActiveFilter =
    type !== '' || warehouseId !== '' || variantId !== '' || from !== '' || to !== ''

  const applyFilters = (): void => {
    if (invalidDateRange) {
      return
    }
    setType(typeInput)
    setWarehouseId(warehouseInput)
    setFrom(toIsoStartOfDay(fromInput) ?? '')
    setTo(toIsoEndOfDay(toInput) ?? '')
  }

  const resetFilters = (): void => {
    setTypeInput('')
    setWarehouseInput('')
    setFromInput('')
    setToInput('')
    clearFilters()
    clearVariantParam()
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const clearVariantParam = (): void => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('variantId')
        return next
      },
      { replace: true },
    )
  }

  const removeVariantFilter = (): void => {
    setVariantId('')
    clearVariantParam()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Link to="/inventory" className="text-sm font-medium text-primary hover:underline">
          بازگشت به موجودی
        </Link>
        <Heading level={1}>تاریخچه موجودی</Heading>
      </div>

      <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <Label>نوع حرکت</Label>
          <Select
            name="type"
            value={typeInput}
            onChange={(event) =>
              setTypeInput(event.target.value as InventoryMovementType | '')
            }
          >
            <option value="">همه</option>
            {INVENTORY_MOVEMENT_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {INVENTORY_MOVEMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>انبار</Label>
          <Select
            name="warehouseId"
            value={warehouseInput}
            onChange={(event) => setWarehouseInput(event.target.value)}
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
          <Label>از تاریخ</Label>
          <Input
            name="from"
            type="date"
            value={fromInput}
            onChange={(event) => setFromInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>تا تاریخ</Label>
          <Input
            name="to"
            type="date"
            value={toInput}
            onChange={(event) => setToInput(event.target.value)}
          />
        </Field>
      </div>

      {invalidDateRange && (
        <p className="text-sm text-red-700">تاریخ «از» نباید دیرتر از «تا» باشد.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button color="primary" onClick={applyFilters} disabled={invalidDateRange}>
          اعمال فیلتر
        </Button>
        <Button outline onClick={resetFilters} disabled={!hasActiveFilter}>
          پاک‌کردن فیلترها
        </Button>
      </div>

      {variantId !== '' && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2">
          <Badge>فیلتر واریانت</Badge>
          <span dir="ltr" className="font-mono text-xs text-zinc-600">
            {variantId}
          </span>
          <Button plain onClick={removeVariantFilter} aria-label="حذف فیلتر واریانت">
            حذف
          </Button>
        </div>
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="حرکتی یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها حرکتی ثبت نشده است.'
              : 'هنوز حرکتی برای موجودی ثبت نشده است.'
          }
          actions={
            hasActiveFilter ? (
              <Button outline onClick={resetFilters}>
                حذف فیلترها
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-white p-4">
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>تاریخ و ساعت</TableHeader>
                <TableHeader>عامل</TableHeader>
                <TableHeader>نوع</TableHeader>
                <TableHeader>مقدار</TableHeader>
                <TableHeader>تغییر رزرو</TableHeader>
                <TableHeader>موجودی قبل</TableHeader>
                <TableHeader>موجودی بعد</TableHeader>
                <TableHeader>رزرو قبل</TableHeader>
                <TableHeader>رزرو بعد</TableHeader>
                <TableHeader>دلیل</TableHeader>
                <TableHeader>یادداشت</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="text-zinc-500">
                    {formatDateTime(movement.createdAt)}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {movement.actor
                      ? [movement.actor.firstName, movement.actor.lastName]
                          .filter(Boolean)
                          .join(' ') || movement.actor.mobile
                      : 'سیستم/ناشناس'}
                  </TableCell>
                  <TableCell>
                    <InventoryMovementTypeBadge type={movement.type} />
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {movement.quantity}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {movement.reservedDelta}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {movement.onHandBefore}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {movement.onHandAfter}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {movement.reservedBefore}
                  </TableCell>
                  <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                    {movement.reservedAfter}
                  </TableCell>
                  <TableCell className="text-zinc-500">{movement.reason ?? '—'}</TableCell>
                  <TableCell className="text-zinc-500">{movement.notes ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی تاریخچه موجودی">
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
        {result ? `مجموع: ${result.total} حرکت · ${limit} مورد در هر صفحه` : ''}
      </Text>
    </div>
  )
}