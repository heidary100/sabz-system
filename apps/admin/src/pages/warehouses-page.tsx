import { useEffect, useState } from 'react'
import type { WarehouseStatus, WarehouseSummary } from '@sabz/types'
import { useWarehouseList } from '../hooks/use-warehouse-list'
import { translateApiError } from '../lib/error-messages'
import {
  WAREHOUSE_STATUS_LABELS,
  WAREHOUSE_STATUS_ORDER,
} from '../lib/warehouse-labels'
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
import { WarehouseForm } from '../components/warehouses/warehouse-form'
import { WarehouseStatusBadge } from '../components/warehouses/warehouse-status-badge'
import { WarehouseStatusDialog } from '../components/warehouses/warehouse-status-dialog'

const SEARCH_DEBOUNCE_MS = 300

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

export function WarehousesPage() {
  const {
    search,
    status,
    page,
    limit,
    result,
    loading,
    error,
    setSearch,
    setStatus,
    setPage,
    refetch,
  } = useWarehouseList()

  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, setSearch])

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<WarehouseSummary | null>(null)
  const [statusTarget, setStatusTarget] = useState<WarehouseSummary | null>(null)
  const [statusMode, setStatusMode] = useState<'activate' | 'deactivate'>('activate')

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const hasActiveFilter = status !== '' || search.trim() !== ''

  const openCreate = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (warehouse: WarehouseSummary): void => {
    setEditing(warehouse)
    setFormOpen(true)
  }

  const handleFormSuccess = (): void => {
    setFormOpen(false)
    setEditing(null)
    void refetch()
  }

  const openStatus = (warehouse: WarehouseSummary, mode: 'activate' | 'deactivate'): void => {
    setStatusMode(mode)
    setStatusTarget(warehouse)
  }

  const handleStatusSuccess = (): void => {
    setStatusTarget(null)
    void refetch()
  }

  const handleStatusConflict = (): void => {
    void refetch()
  }

  const clearFilters = (): void => {
    setSearchInput('')
    setSearch('')
    setStatus('')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Heading level={1}>انبارها</Heading>
        <Button color="primary" onClick={openCreate}>
          افزودن انبار
        </Button>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <Label>جستجو</Label>
          <Input
            type="search"
            name="search"
            placeholder="جستجو با نام یا کد انبار…"
            maxLength={100}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as WarehouseStatus | '')}
          >
            <option value="">همه</option>
            {WAREHOUSE_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {WAREHOUSE_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

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
          title="انباری یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها انباری ثبت نشده است.'
              : 'هنوز انباری ثبت نشده است.'
          }
          actions={
            hasActiveFilter ? (
              <Button outline onClick={clearFilters}>
                حذف فیلترها
              </Button>
            ) : (
              <Button outline onClick={openCreate}>
                افزودن انبار
              </Button>
            )
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-white p-4">
          <Table striped>
            <TableHead>
              <TableRow>
                <TableHeader>کد</TableHeader>
                <TableHeader>نام</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((warehouse) => (
                <TableRow key={warehouse.id}>
                  <TableCell dir="ltr" className="font-medium text-zinc-950">
                    {warehouse.code}
                  </TableCell>
                  <TableCell className="text-zinc-500">{warehouse.name}</TableCell>
                  <TableCell>
                    <WarehouseStatusBadge status={warehouse.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button plain onClick={() => openEdit(warehouse)}>
                        ویرایش
                      </Button>
                      {warehouse.status === 'ACTIVE' ? (
                        <Button outline onClick={() => openStatus(warehouse, 'deactivate')}>
                          غیرفعال‌سازی
                        </Button>
                      ) : (
                        <Button outline onClick={() => openStatus(warehouse, 'activate')}>
                          فعال‌سازی
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی انبارها">
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
        {result ? `مجموع: ${result.total} انبار · ${limit} مورد در هر صفحه` : ''}
      </Text>

      <WarehouseForm
        open={formOpen}
        warehouse={editing}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSuccess={handleFormSuccess}
        onConflict={() => void refetch()}
      />

      <WarehouseStatusDialog
        open={statusTarget !== null}
        warehouse={statusTarget}
        mode={statusMode}
        onClose={() => setStatusTarget(null)}
        onSuccess={handleStatusSuccess}
        onConflict={handleStatusConflict}
      />
    </div>
  )
}