import { useEffect, useState } from 'react'
import type { WarehouseStatus, WarehouseSummary } from '@sabz/types'
import { useWarehouseList } from '../hooks/use-warehouse-list'
import { translateApiError } from '../lib/error-messages'
import {
  WAREHOUSE_STATUS_LABELS,
  WAREHOUSE_STATUS_ORDER,
} from '../lib/warehouse-labels'
import { Pencil, Plus, Warehouse } from 'lucide-react'
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
import { ErrorState } from '../components/ui/error-state'
import { TablePagination } from '../components/ui/table-pagination'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import { WarehouseForm } from '../components/warehouses/warehouse-form'
import { WarehouseStatusBadge } from '../components/warehouses/warehouse-status-badge'
import { WarehouseStatusDialog } from '../components/warehouses/warehouse-status-dialog'

const SEARCH_DEBOUNCE_MS = 300

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
    setLimit,
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

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

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
    <div className="w-full space-y-6">
      <PageHeader
        title="انبارها"
        actions={
          <Button color="primary" onClick={openCreate}>
            <Plus data-slot="icon" />
            افزودن انبار
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-4">
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
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()} />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          icon={<Warehouse />}
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
            totalLabel="انبار"
          />
          <Table dense>
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
                  <TableCell dir="ltr" className="font-medium text-foreground">
                    {warehouse.code}
                  </TableCell>
                  <TableCell className="text-muted">{warehouse.name}</TableCell>
                  <TableCell>
                    <WarehouseStatusBadge status={warehouse.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button plain onClick={() => openEdit(warehouse)}>
                        <Pencil data-slot="icon" />
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
            totalLabel="انبار"
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