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
import { StatusBadge } from '../partners/status-badge'
import { formatDate } from '../../lib/format'

export function RecentPartners({ partners }: { partners: AdminPartnerListItem[] }) {
  const navigate = useNavigate()

  const openPartner = (partnerId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    navigate(`/partners/${partnerId}`)
  }

  return (
    <section className="rounded-lg border border-border bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Subheading>درخواست‌های اخیر همکاری</Subheading>
        <Button plain href="/partners">
          مشاهده همه
        </Button>
      </div>
      {partners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-background px-4 py-10 text-center text-sm/6 text-dust-200">
          درخواست جدیدی ثبت نشده است.
        </p>
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
                <TableCell className="font-medium text-zinc-950">
                  {partner.businessName}
                </TableCell>
                <TableCell>
                  <StatusBadge status={partner.approvalStatus} />
                </TableCell>
                <TableCell className="text-zinc-500">
                  {[partner.province, partner.city].filter(Boolean).join('، ') || '—'}
                </TableCell>
                <TableCell className="text-zinc-500">
                  {formatDate(partner.submittedAt ?? partner.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}