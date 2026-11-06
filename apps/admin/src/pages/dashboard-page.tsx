import { useDashboard } from '../hooks/use-dashboard'
import { translateApiError } from '../lib/error-messages'
import { formatDate, formatRial } from '../lib/format'
import { ORDER_STATUS_LABELS, ORDER_STATUS_ORDER } from '../lib/order-labels'
import { ROLE_LABELS } from '../lib/user-labels'
import { PARTNER_STATUS_LABELS } from '../lib/partner-labels'
import type {
  DashboardCommerce,
  DashboardPartnerCounts,
  DashboardRoleCounts,
  DashboardUserCounts,
  OrderStatus,
  PartnerStatus,
} from '@sabz/types'
import { RefreshCw } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { Subheading } from '../components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { Text } from '../components/catalyst/text'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { TableCard } from '../components/ui/table-card'
import { StatCard } from '../components/dashboard/stat-card'
import type { StatCardTone } from '../components/dashboard/stat-card'
import { RecentPartners } from '../components/dashboard/recent-partners'
import { RecentAudit } from '../components/dashboard/recent-audit'

const USER_STATS: Array<{
  key: keyof DashboardUserCounts
  label: string
  tone: 'primary' | 'zinc' | 'green' | 'red' | 'amber'
}> = [
  { key: 'total', label: 'کل کاربران', tone: 'primary' },
  { key: 'active', label: 'فعال', tone: 'green' },
  { key: 'suspended', label: 'تعلیق‌شده', tone: 'red' },
  { key: 'locked', label: 'قفل‌شده', tone: 'zinc' },
  { key: 'pendingOtp', label: 'در انتظار تأیید', tone: 'amber' },
]

const ROLE_STATS: Array<{ key: keyof DashboardRoleCounts; label: string }> = [
  { key: 'customer', label: ROLE_LABELS.CUSTOMER },
  { key: 'partner', label: ROLE_LABELS.PARTNER },
  { key: 'operator', label: ROLE_LABELS.OPERATOR },
  { key: 'admin', label: ROLE_LABELS.ADMIN },
]

const PARTNER_STATS: Array<{
  status: PartnerStatus
  key: keyof DashboardPartnerCounts
  tone: 'zinc' | 'amber' | 'green' | 'red'
}> = [
  { status: 'DRAFT', key: 'draft', tone: 'zinc' },
  { status: 'PENDING', key: 'pending', tone: 'amber' },
  { status: 'APPROVED', key: 'approved', tone: 'green' },
  { status: 'REJECTED', key: 'rejected', tone: 'red' },
]

const ORDER_TONES: Record<OrderStatus, StatCardTone> = {
  PENDING: 'amber',
  PROCESSING: 'primary',
  SHIPPED: 'zinc',
  DELIVERED: 'green',
  CANCELLED: 'red',
}

const QUEUE_ROWS: Array<{
  key: keyof Pick<DashboardCommerce, 'pendingRfqs' | 'pendingReviews' | 'draftPosts'>
  label: string
  to: string
  action: string
}> = [
  { key: 'pendingRfqs', label: 'استعلام‌های در انتظار', to: '/rfq', action: 'مشاهده استعلام‌ها' },
  { key: 'pendingReviews', label: 'نقدهای در انتظار بررسی', to: '/reviews', action: 'مشاهده نقدها' },
  { key: 'draftPosts', label: 'پیش‌نویس‌های وبلاگ', to: '/blog', action: 'مشاهده وبلاگ' },
]

export function DashboardPage() {
  const { dashboard, loading, error, refetch } = useDashboard()

  const errorMessage = error ? translateApiError(error) : null

  if (loading && !dashboard) {
    return <Loading compact label="در حال بارگذاری…" />
  }

  if (error && !dashboard) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="پیشخوان" />
        <div className="surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
          <p className="text-sm/6 text-muted">{errorMessage}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      </div>
    )
  }

  if (!dashboard) {
    return null
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="پیشخوان"
        actions={
          <Button outline onClick={() => void refetch()} disabled={loading}>
            <RefreshCw data-slot="icon" />
            به‌روزرسانی
          </Button>
        }
      />

      {errorMessage && (
        <div className="surface-card flex items-center justify-between gap-4 rounded-lg px-4 py-3">
          <p className="text-sm/6 text-muted">{errorMessage}</p>
          <Button color="primary" onClick={() => void refetch()} disabled={loading}>
            تلاش مجدد
          </Button>
        </div>
      )}

      <section className="space-y-4">
        <Subheading>آمار کاربران</Subheading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {USER_STATS.map((stat) => (
            <StatCard
              key={stat.key}
              label={stat.label}
              value={dashboard.users[stat.key]}
              tone={stat.tone}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <Subheading>توزیع نقش‌ها</Subheading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_STATS.map((stat) => (
            <StatCard key={stat.key} label={stat.label} value={dashboard.roles[stat.key]} />
          ))}
        </div>
        <Text>تعداد کاربران دارای هر نقش، بدون در نظر گرفتن وضعیت حساب.</Text>
      </section>

      <section className="space-y-4">
        <Subheading>چرخه بررسی همکاران</Subheading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PARTNER_STATS.map((stat) => (
            <StatCard
              key={stat.key}
              label={PARTNER_STATUS_LABELS[stat.status]}
              value={dashboard.partners[stat.key]}
              tone={stat.tone}
            />
          ))}
        </div>
        <Text>این آمار وضعیت کنونی درخواست‌هاست، نه روند زمانی.</Text>
      </section>

      <section className="space-y-4">
        <Subheading>گزارش سفارش‌ها</Subheading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="مجموع سفارش‌ها" value={dashboard.commerce.totalOrders} tone="primary" />
          {ORDER_STATUS_ORDER.map((status) => (
            <StatCard
              key={status}
              label={ORDER_STATUS_LABELS[status]}
              value={dashboard.commerce.ordersByStatus[status.toLowerCase() as keyof DashboardCommerce['ordersByStatus']]}
              tone={ORDER_TONES[status]}
            />
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="surface-card flex flex-col gap-1 rounded-xl p-4">
            <span className="text-sm/5 font-medium text-muted">درآمد تسویه‌شده (ریال)</span>
            <span className="text-3xl/9 font-bold tabular-nums text-green-700 dark:text-green-400">
              {formatRial(dashboard.commerce.paidRevenueRial)}
            </span>
          </div>
          <StatCard label="پرداخت در محل" value={dashboard.commerce.payments.cod} tone="amber" />
          <StatCard label="پرداخت آنلاین" value={dashboard.commerce.payments.online} tone="zinc" />
          <StatCard
            label="سهم پرداخت در محل (٪)"
            value={dashboard.commerce.payments.codSharePct}
            tone="primary"
          />
        </div>
        <Text>
          درآمد فقط سفارش‌های تسویه‌شده (وضعیت پرداخت «پرداخت شده») را جمع می‌زند؛ مبالغ به
          ریال هستند.
        </Text>
      </section>

      <TableCard>
        <div className="mb-4 flex items-center justify-between gap-4">
          <Subheading>صف‌های انتظار بررسی</Subheading>
        </div>
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>صف</TableHeader>
              <TableHeader>تعداد</TableHeader>
              <TableHeader>اقدام</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {QUEUE_ROWS.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                <TableCell className="tabular-nums">{dashboard.commerce[row.key]}</TableCell>
                <TableCell>
                  <Button plain href={row.to}>
                    {row.action}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>

      <TableCard>
        <div className="mb-4 flex items-center justify-between gap-4">
          <Subheading>روند ۱۴ روزه سفارش‌ها</Subheading>
        </div>
        <Table striped>
          <TableHead>
            <TableRow>
              <TableHeader>تاریخ</TableHeader>
              <TableHeader>سفارش‌ها</TableHeader>
              <TableHeader>درآمد تسویه‌شده</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {dashboard.commerce.ordersByDay.map((point) => (
              <TableRow key={point.date}>
                <TableCell className="font-medium text-foreground">
                  {formatDate(`${point.date}T00:00:00.000Z`)}
                </TableCell>
                <TableCell className="tabular-nums">{point.orders}</TableCell>
                <TableCell className="text-muted">{formatRial(point.revenueRial)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Text>روزها به تقویم میلادی (UTC) گروه‌بندی شده‌اند؛ بدون نمودار، فقط جدول گزارش.</Text>
      </TableCard>

      <RecentPartners partners={dashboard.recentPartners} />

      <RecentAudit entries={dashboard.recentAudit} />
    </div>
  )
}
