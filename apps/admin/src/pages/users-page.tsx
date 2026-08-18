import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserList } from '../hooks/use-user-list'
import { translateApiError } from '../lib/error-messages'
import { formatDate } from '../lib/format'
import {
  ROLE_LABELS,
  ROLE_ORDER,
  USER_STATUS_LABELS,
  USER_STATUS_ORDER,
} from '../lib/user-labels'
import type { AppRole, UserStatus } from '@sabz/types'
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
import { UserStatusBadge } from '../components/users/user-status-badge'

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

export function UsersPage() {
  const navigate = useNavigate()
  const {
    search,
    status,
    role,
    page,
    limit,
    result,
    loading,
    error,
    setSearch,
    setStatus,
    setRole,
    setPage,
    refetch,
  } = useUserList()

  const [searchInput, setSearchInput] = useState(search)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput, setSearch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1

  const openUser = (userId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/users/${userId}`)
  }

  const hasActiveFilter = status !== '' || role !== '' || search.trim() !== ''

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <Heading level={1}>کاربران</Heading>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-3">
          <Label>جستجو</Label>
          <Input
            type="search"
            name="search"
            placeholder="جستجو با موبایل یا نام…"
            maxLength={32}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </Field>
        <Field>
          <Label>وضعیت</Label>
          <Select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as UserStatus | '')}
          >
            <option value="">همه</option>
            {USER_STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {USER_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>نقش</Label>
          <Select
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value as AppRole | '')}
          >
            <option value="">همه</option>
            {ROLE_ORDER.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
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
          title="کاربری یافت نشد"
          description={
            hasActiveFilter
              ? 'با این فیلترها کاربری ثبت نشده است.'
              : 'هنوز کاربری ثبت نشده است.'
          }
          actions={
            hasActiveFilter ? (
              <Button
                outline
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                  setStatus('')
                  setRole('')
                }}
              >
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
                <TableHeader>موبایل</TableHeader>
                <TableHeader>نام</TableHeader>
                <TableHeader>وضعیت</TableHeader>
                <TableHeader>نقش‌ها</TableHeader>
                <TableHeader>همکار</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((user) => (
                <TableRow
                  key={user.id}
                  href={`/users/${user.id}`}
                  title={`مشاهده ${user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile}`}
                  onNavigate={openUser(user.id)}
                >
                  <TableCell dir="ltr" className="font-medium text-zinc-950">
                    {user.mobile}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {user.profile
                      ? `${user.profile.firstName} ${user.profile.lastName}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={user.status} />
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {user.roles.length > 0
                      ? user.roles.map((role) => ROLE_LABELS[role]).join('، ')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {user.partner?.businessName ?? '—'}
                  </TableCell>
                  <TableCell className="text-zinc-500">
                    {formatDate(user.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 border-t border-border pt-4">
            <Pagination aria-label="صفحه‌بندی کاربران">
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
        {result ? `مجموع: ${result.total} کاربر · ${limit} مورد در هر صفحه` : ''}
      </p>
    </div>
  )
}
