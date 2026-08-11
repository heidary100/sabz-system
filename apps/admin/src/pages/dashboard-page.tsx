import { EmptyState } from '../components/ui/empty-state'

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EmptyState
        title="پیشخوان"
        description="بخش‌های مدیریتی به‌زودی به این صفحه اضافه می‌شوند."
      />
    </div>
  )
}
