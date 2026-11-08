import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useNotificationList } from '../hooks/use-notification-list'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { NotificationTypeBadge } from '../components/notifications/notification-type-badge'
import { Button } from '../components/catalyst/button'
import { Field, Label } from '../components/catalyst/fieldset'
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
import { InlineError } from '../components/ui/inline-error'
import { PageHeader } from '../components/ui/page-header'
import { TablePagination } from '../components/ui/table-pagination'
import { TableCard } from '../components/ui/table-card'

function entityLink(
  entity: string | null,
  entityId: string | null,
): string | null {
  if (!entity || !entityId) {
    return null
  }
  switch (entity) {
    case 'Order':
      return `/orders/${entityId}`
    case 'ReturnRequest':
      return `/returns/${entityId}`
    case 'Rfq':
      return `/rfq/${entityId}`
    case 'Partner':
      return `/partners/${entityId}`
    default:
      return null
  }
}

export function NotificationsPage() {
  const {
    unreadOnly,
    page,
    limit,
    result,
    unread,
    loading,
    error,
    mutatingId,
    actionError,
    setUnreadOnly,
    setPage,
    setLimit,
    refetch,
    markRead,
  } = useNotificationList()

  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="اعلان‌ها"
        subtitle={
          unread > 0 ? `${unread} اعلان خوانده‌نشده دارید.` : undefined
        }
      />

      <div className="flex w-full max-w-xs items-end gap-4">
        <Field className="w-full">
          <Label>نمایش</Label>
          <Select
            name="visibility"
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(event) =>
              setUnreadOnly(event.target.value === 'unread')
            }
          >
            <option value="unread">خوانده‌نشده‌ها</option>
            <option value="all">همه اعلان‌ها</option>
          </Select>
        </Field>
      </div>

      {actionError && (
        <InlineError message={actionError} />
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری…" />
      ) : error ? (
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()} />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          title="اعلانی یافت نشد"
          description={
            unreadOnly
              ? 'اعلان خوانده‌نشده‌ای ندارید.'
              : 'تاکنون اعلانی برای شما ثبت نشده است.'
          }
          icon={<Bell className="size-6" aria-hidden="true" />}
          actions={
            unreadOnly ? (
              <Button outline onClick={() => setUnreadOnly(false)}>
                مشاهده همه اعلان‌ها
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableCard>
          <TablePagination
            position="top"
            page={page}
            totalPages={totalPages}
            total={result?.total ?? 0}
            onPageChange={setPage}
            limit={limit}
            limitOptions={[20, 50]}
            onLimitChange={setLimit}
            disabled={loading}
            totalLabel="اعلان"
          />
          <Table dense>
            <TableHead>
              <TableRow>
                <TableHeader>نوع</TableHeader>
                <TableHeader>عنوان</TableHeader>
                <TableHeader>متن</TableHeader>
                <TableHeader>پیوند</TableHeader>
                <TableHeader>تاریخ ثبت</TableHeader>
                <TableHeader>
                  <span className="sr-only">عملیات</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {result.items.map((item) => {
                const link = entityLink(item.entity, item.entityId)
                const isUnread = item.readAt === null
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <NotificationTypeBadge type={item.type} />
                    </TableCell>
                    <TableCell className={isUnread ? 'font-semibold' : undefined}>
                      {item.title}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      {item.body}
                    </TableCell>
                    <TableCell>
                      {link ? (
                        <Link
                          to={link}
                          className="underline decoration-border underline-offset-4 hover:text-primary"
                        >
                          مشاهده
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                    <TableCell>
                      {isUnread ? (
                        <Button
                          outline
                          disabled={mutatingId === item.id}
                          onClick={() => void markRead(item.id)}
                        >
                          {mutatingId === item.id
                            ? 'در حال ثبت…'
                            : 'خوانده شد'}
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TablePagination
            position="bottom"
            page={page}
            totalPages={totalPages}
            total={result?.total ?? 0}
            onPageChange={setPage}
            limit={limit}
            limitOptions={[20, 50]}
            onLimitChange={setLimit}
            disabled={loading}
            totalLabel="اعلان"
          />
        </TableCard>
      )}

    </div>
  )
}
