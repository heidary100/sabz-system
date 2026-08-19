import { useDashboard } from '../hooks/use-dashboard'
import { translateApiError } from '../lib/error-messages'
import { ROLE_LABELS } from '../lib/user-labels'
import { PARTNER_STATUS_LABELS } from '../lib/partner-labels'
import type {
  DashboardPartnerCounts,
  DashboardRoleCounts,
  DashboardUserCounts,
  PartnerStatus,
} from '@sabz/types'
import { Button } from '../components/catalyst/button'
import { Heading, Subheading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'
import { Loading } from '../components/ui/loading'
import { StatCard } from '../components/dashboard/stat-card'
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

export function DashboardPage() {
  const { dashboard, loading, error, refetch } = useDashboard()

  const errorMessage = error ? translateApiError(error) : null

  if (loading && !dashboard) {
    return <Loading compact label="در حال بارگذاری…" />
  }

  if (error && !dashboard) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Heading level={1}>پیشخوان</Heading>
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{errorMessage}</p>
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
      <div className="flex items-center justify-between">
        <Heading level={1}>پیشخوان</Heading>
        <Button outline onClick={() => void refetch()} disabled={loading}>
          به‌روزرسانی
        </Button>
      </div>

      {errorMessage && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-white px-4 py-3">
          <p className="text-sm/6 text-dust-200">{errorMessage}</p>
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

      <RecentPartners partners={dashboard.recentPartners} />

      <RecentAudit entries={dashboard.recentAudit} />
    </div>
  )
}
