import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { ReservationStatus, ReservationSummary } from '@sabz/types'
import { useReservationList } from '../hooks/use-reservation-list'
import { useWarehouseOptions } from '../hooks/use-warehouse-options'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import {
  RESERVATION_STATUS_LABELS,
  RESERVATION_STATUS_ORDER,
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
import { ReservationStatusBadge } from '../components/inventory/reservation-status-badge'
import { ReleaseReservationDialog } from '../components/inventory/release-reservation-dialog'
import { ConsumeReservationDialog } from '../components/inventory/consume-reservation-dialog'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ActionTarget = { mode: 'release' | 'consume'; reservation: ReservationSummary }

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

function terminalTimestamp(reservation: ReservationSummary): string | null {
  switch (reservation.status) {
    case 'RELEASED':
      return reservation.releasedAt
    case 'CONSUMED':
      return reservation.consumedAt
    case 'EXPIRED':
      return reservation.expiredAt
    default:
      return null
  }
}

function isOverdue(reservation: ReservationSummary): boolean {
  if (reservation.status !== 'ACTIVE' || !reservation.expiresAt) {
    return false
  }
  return new Date(reservation.expiresAt).getTime() < Date.now()
}

export function InventoryReservationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawVariantId = searchParams.get('variantId') ?? ''
  const initialVariantId = UUID_PATTERN.test(rawVariantId) ? rawVariantId : ''

  const {
    status,
    warehouseId,
    variantId,
    page,
    limit,
    result,
    loading,
    error,
    setStatus,
    setWarehouseId,
    setVariantId,
    setPage,
    clearFilters,
    refetch,
  } = useReservationList(initialVariantId)

  const { warehouses } = useWarehouseOptions()

  const [statusInput, setStatusInput] = useState<ReservationStatus | ''>(status)
  const [warehouseInput, setWarehouseInput] = useState(warehouseId)
  const [variantIdInput, setVariantIdInput] = useState(variantId)

  const [target, setTarget] = useState<ActionTarget | null>(null)

  const invalidVariantId =
    variantIdInput.trim() !== '' && !UUID_PATTERN.test(variantIdInput.trim())

  const hasActiveFilter =
    status !== '' || warehouseId !== '' || variantId !== ''

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const applyFilters = (): void => {
    if (invalidVariantId) {
      return
    }
    setStatus(statusInput)
    setWarehouseId(warehouseInput)
    setVariantId(variantIdInput.trim())
  }

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

  const resetFilters = (): void => {
    setStatusInput('')
    setWarehouseInput('')
    setVariantIdInput('')
    clearFilters()
    clearVariantParam()
  }

  const removeVariantFilter = (): void => {
    setVariantIdInput('')
    setVariantId('')
    clearVariantParam()
  }

  const handleActionSuccess = (): void => {
    setTarget(null)
    void refetch()
  }

  const handleActionConflict = (): void => {
    void refetch()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <Link to="/inventory" className="text-sm font-medium text-primary hover:underline">
          بازگشت به موجودی
        </Link>
        <Heading level={1}>رزروها</Heading>
      </div>

      <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <Label>وضعیت رزرو</Label>
          <Select
            name="status"
            value={statusInput}
            onChange={(event) => setStatusInput(event.target.value as ReservationStatus | '')}
          >
            <option value="">همه</option>
            {RESERVATION_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {RESERVATION_STATUS_LABELS[value]}
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
          <Label>شناسه واریانت</Label>
          <Input
            name="variantId"
            dir="ltr"
            placeholder="UUID واریانت"
            value={variantIdInput}
            onChange={(event) => setVariantIdInput(event.target.value)}
          />
        </Field>
      </div>

      {invalidVariantId && (
        <p className="text-sm text-red-700">شناسه واریانت باید یک UUID معتبر باشد.</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button color="primary" onClick={applyFilters} disabled={invalidVariantId}>
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
          title="رزروی یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها رزروی ثبت نشده است.'
              : 'هنوز رزروی ثبت نشده است.'
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
                <TableHeader>SKU</TableHeader>
                <TableHeader>نام واریانت</TableHeader>
                <TableHeader>انبار</TableHeader>
                <TableHeader>تعداد</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>انقضا</TableHeader>
                <TableHeader>تاریخ ایجاد</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((reservation) => {
                const terminalAt = terminalTimestamp(reservation)
                const overdue = isOverdue(reservation)
                return (
                  <TableRow key={reservation.id}>
                    <TableCell dir="ltr" className="font-medium text-zinc-950">
                      {reservation.variant.sku}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      <Link
                        to={`/inventory/variants/${reservation.variant.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {reservation.variant.name ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      <Link
                        to={`/inventory/warehouses/${reservation.warehouse.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {reservation.warehouse.name}
                      </Link>
                    </TableCell>
                    <TableCell dir="ltr" className="tabular-nums text-zinc-500">
                      {reservation.quantity}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <ReservationStatusBadge status={reservation.status} />
                        {terminalAt && (
                          <span className="text-xs text-zinc-400">
                            {formatDateTime(terminalAt)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {reservation.expiresAt ? (
                        <div className="flex flex-col items-start gap-1">
                          <span dir="ltr">{formatDateTime(reservation.expiresAt)}</span>
                          {overdue && (
                            <span className="text-xs text-amber-700">
                              زمان انقضا گذشته است؛ پس از یک عملیات وضعیت به‌روزرسانی می‌شود
                            </span>
                          )}
                        </div>
                      ) : (
                        'بدون انقضا'
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDateTime(reservation.createdAt)}
                    </TableCell>
                    <TableCell>
                      {reservation.status === 'ACTIVE' ? (
                        <div className="flex items-center gap-2">
                          <Button
                            outline
                            onClick={() =>
                              setTarget({ mode: 'release', reservation })
                            }
                          >
                            آزادسازی
                          </Button>
                          <Button
                            outline
                            onClick={() =>
                              setTarget({ mode: 'consume', reservation })
                            }
                          >
                            مصرف
                          </Button>
                        </div>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی رزروها">
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
        {result ? `مجموع: ${result.total} رزرو · ${limit} مورد در هر صفحه` : ''}
      </Text>

      <ReleaseReservationDialog
        open={target?.mode === 'release'}
        reservation={target?.mode === 'release' ? target.reservation : null}
        onClose={() => setTarget(null)}
        onSuccess={handleActionSuccess}
        onConflict={handleActionConflict}
      />

      <ConsumeReservationDialog
        open={target?.mode === 'consume'}
        reservation={target?.mode === 'consume' ? target.reservation : null}
        onClose={() => setTarget(null)}
        onSuccess={handleActionSuccess}
        onConflict={handleActionConflict}
      />
    </div>
  )
}