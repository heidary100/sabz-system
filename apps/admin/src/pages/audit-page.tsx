import { useState } from 'react'
import type { AuditEntry } from '@sabz/types'
import { useAuditLog } from '../hooks/use-audit-log'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import {
  AUDIT_ACTION_ORDER,
  AUDIT_ENTITY_ORDER,
  auditActionLabel,
  auditEntityLabel,
} from '../lib/audit-labels'
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
import { AuditDetailsDialog } from '../components/audit/audit-details-dialog'
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

function isValidUuid(value: string): boolean {
  return value.trim() === '' || UUID_PATTERN.test(value.trim())
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

export function AuditPage() {
  const {
    actorId,
    action,
    entity,
    entityId,
    from,
    to,
    page,
    limit,
    result,
    loading,
    error,
    setActorId,
    setAction,
    setEntity,
    setEntityId,
    setFrom,
    setTo,
    setPage,
    clearFilters,
    refetch,
  } = useAuditLog()

  const [actorInput, setActorInput] = useState(actorId)
  const [actionInput, setActionInput] = useState(action)
  const [entityInput, setEntityInput] = useState(entity)
  const [entityIdInput, setEntityIdInput] = useState(entityId)
  const [fromInput, setFromInput] = useState(from)
  const [toInput, setToInput] = useState(to)
  const [detailsEntry, setDetailsEntry] = useState<AuditEntry | null>(null)

  const invalidActor = !isValidUuid(actorInput)
  const invalidEntityId = !isValidUuid(entityIdInput)
  const invalidDateRange = fromInput !== '' && toInput !== '' && fromInput > toInput

  const hasInvalidInput = invalidActor || invalidEntityId || invalidDateRange
  const hasActiveFilter =
    actorId !== '' ||
    action !== '' ||
    entity !== '' ||
    entityId !== '' ||
    from !== '' ||
    to !== ''

  const applyFilters = () => {
    if (hasInvalidInput) {
      return
    }
    setActorId(actorInput.trim())
    setAction(actionInput)
    setEntity(entityInput)
    setEntityId(entityIdInput.trim())
    setFrom(toIsoStartOfDay(fromInput) ?? '')
    setTo(toIsoEndOfDay(toInput) ?? '')
  }

  const resetFilters = () => {
    setActorInput('')
    setActionInput('')
    setEntityInput('')
    setEntityIdInput('')
    setFromInput('')
    setToInput('')
    clearFilters()
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Heading level={1}>گزارش فعالیت‌ها</Heading>
      </div>

      <div className="grid w-full max-w-5xl gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field className="sm:col-span-2 lg:col-span-2">
          <Label>عامل (شناسه کاربر)</Label>
          <Input
            name="actorId"
            dir="ltr"
            placeholder="شناسه UUID عامل…"
            value={actorInput}
            onChange={(event) => setActorInput(event.target.value)}
          />
          {invalidActor && (
            <p className="text-xs text-red-700">شناسه باید UUID معتبر باشد.</p>
          )}
        </Field>
        <Field>
          <Label>عملیات</Label>
          <Select
            name="action"
            value={actionInput}
            onChange={(event) => setActionInput(event.target.value)}
          >
            <option value="">همه</option>
            {AUDIT_ACTION_ORDER.map((value) => (
              <option key={value} value={value}>
                {auditActionLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>موجودیت</Label>
          <Select
            name="entity"
            value={entityInput}
            onChange={(event) => setEntityInput(event.target.value)}
          >
            <option value="">همه</option>
            {AUDIT_ENTITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {auditEntityLabel(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>شناسه موجودیت</Label>
          <Input
            name="entityId"
            dir="ltr"
            placeholder="UUID موجودیت…"
            value={entityIdInput}
            onChange={(event) => setEntityIdInput(event.target.value)}
          />
          {invalidEntityId && (
            <p className="text-xs text-red-700">شناسه باید UUID معتبر باشد.</p>
          )}
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

      <div className="flex items-center gap-3">
        <Button color="primary" onClick={applyFilters} disabled={hasInvalidInput}>
          اعمال فیلتر
        </Button>
        <Button outline onClick={resetFilters} disabled={!hasActiveFilter}>
          پاک‌کردن فیلترها
        </Button>
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
          title="رویدادی یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها فعالیتی ثبت نشده است.'
              : 'هنوز فعالیتی ثبت نشده است.'
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
                <TableHeader>عملیات</TableHeader>
                <TableHeader>موجودیت</TableHeader>
                <TableHeader>شناسه موجودیت</TableHeader>
                <TableHeader>جزئیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-zinc-500">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {entry.actor
                      ? [entry.actor.firstName, entry.actor.lastName]
                          .filter(Boolean)
                          .join(' ') || entry.actor.mobile
                      : 'سیستم/ناشناس'}
                  </TableCell>
                  <TableCell>
                    <Badge>{auditActionLabel(entry.action)}</Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {auditEntityLabel(entry.entity)}
                  </TableCell>
                  <TableCell dir="ltr" className="font-mono text-xs text-zinc-500">
                    {entry.entityId ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      plain
                      onClick={() => setDetailsEntry(entry)}
                      aria-label="مشاهده جزئیات"
                    >
                      مشاهده
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی گزارش فعالیت‌ها">
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

      <p className="text-xs text-dust-200">
        {result ? `مجموع: ${result.total} رویداد · ${limit} مورد در هر صفحه` : ''}
      </p>

      <AuditDetailsDialog
        entry={detailsEntry}
        open={detailsEntry !== null}
        onClose={() => setDetailsEntry(null)}
      />
    </div>
  )
}
