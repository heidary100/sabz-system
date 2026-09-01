import type { DashboardRecentAudit } from '@sabz/types'
import { Button } from '../catalyst/button'
import { Subheading } from '../catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../catalyst/table'
import { Badge } from '../catalyst/badge'
import { auditActionLabel, auditEntityLabel } from '../../lib/audit-labels'
import { formatDateTime } from '../../lib/format'
import { TableCard } from '../ui/table-card'

function actorName(
  actor: DashboardRecentAudit['actor'],
): string {
  if (!actor) {
    return 'سیستم/ناشناس'
  }
  return [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.mobile
}

export function RecentAudit({ entries }: { entries: DashboardRecentAudit[] }) {
  return (
    <TableCard>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Subheading>فعالیت‌های اخیر</Subheading>
        <Button plain href="/audit">
          مشاهده همه
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-background px-4 py-10 text-center text-sm/6 text-muted">
          هنوز فعالیتی ثبت نشده است.
        </p>
      ) : (
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>تاریخ و ساعت</TableHeader>
              <TableHeader>عامل</TableHeader>
              <TableHeader>عملیات</TableHeader>
              <TableHeader>موجودیت</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-muted">
                  {formatDateTime(entry.createdAt)}
                </TableCell>
                <TableCell className="text-muted">{actorName(entry.actor)}</TableCell>
                <TableCell>
                  <Badge>{auditActionLabel(entry.action)}</Badge>
                </TableCell>
                <TableCell className="text-muted">
                  {auditEntityLabel(entry.entity)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </TableCard>
  )
}