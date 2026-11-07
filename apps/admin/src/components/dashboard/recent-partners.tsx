import { useNavigate } from 'react-router-dom'
import type { AdminPartnerListItem } from '@sabz/types'
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
import { PartnerStatusBadge } from '../partners/status-badge'
import { TableCard } from '../ui/table-card'
import { EmptyState } from '../ui/empty-state'
import { formatDate } from '../../lib/format'

export function RecentPartners({ partners }: { partners: AdminPartnerListItem[] }) {
  const navigate = useNavigate()

  const openPartner = (partnerId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/partners/${partnerId}`)
  }

  return (
    <TableCard>
      <div className="mb-4 flex items-center justify-between gap-4">
        <Subheading>درخواست‌های اخیر همکاری</Subheading>
        <Button plain href="/partners">
          مشاهده همه
        </Button>
      </div>
      {partners.length === 0 ? (
        <EmptyState size="compact" title="درخواست جدیدی ثبت نشده است." />
      ) : (
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>نام کسب‌وکار</TableHeader>
              <TableHeader>وضعیت</TableHeader>
              <TableHeader>موقعیت</TableHeader>
              <TableHeader>تاریخ ثبت</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {partners.map((partner) => (
              <TableRow
                key={partner.id}
                href={`/partners/${partner.id}`}
                title={`مشاهده ${partner.businessName}`}
                onNavigate={openPartner(partner.id)}
              >
                <TableCell className="font-medium text-foreground">
                  {partner.businessName}
                </TableCell>
                <TableCell>
                  <PartnerStatusBadge status={partner.approvalStatus} />
                </TableCell>
                <TableCell className="text-muted">
                  {[partner.province, partner.city].filter(Boolean).join('، ') || '—'}
                </TableCell>
                <TableCell className="text-muted">
                  {formatDate(partner.submittedAt ?? partner.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </TableCard>
  )
}