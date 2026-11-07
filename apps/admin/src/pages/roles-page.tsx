import { useRoles } from '../hooks/use-roles'
import { translateApiError } from '../lib/error-messages'
import { ROLE_LABELS } from '../lib/user-labels'
import { ShieldCheck } from 'lucide-react'
import { Subheading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { ErrorState } from '../components/ui/error-state'
import { PageHeader } from '../components/ui/page-header'

export function RolesPage() {
  const { roles, loading, error, refetch } = useRoles()

  if (loading && roles.length === 0) {
    return <Loading label="در حال بارگذاری نقش‌ها…" />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <ErrorState message={translateApiError(error)} onRetry={() => void refetch()} />
      </div>
    )
  }

  if (roles.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="نقش‌ها" />
        <EmptyState
          title="نقشی یافت نشد"
          description="هیچ نقشی در سامانه تعریف نشده است."
          icon={<ShieldCheck className="size-6" aria-hidden="true" />}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="نقش‌ها" />
      <div className="grid gap-6 lg:grid-cols-2">
        {roles.map((role) => (
          <section key={role.id} className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <Subheading>{ROLE_LABELS[role.name]}</Subheading>
            <Text className="mt-3">{role.description || '—'}</Text>
            <div className="mt-4">
              <Text className="text-sm font-medium text-foreground">مجوزها</Text>
              {role.permissions.length === 0 ? (
                <Text className="mt-1">بدون مجوز</Text>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {role.permissions.map((permission) => (
                    <span
                      key={permission}
                      className="rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium text-foreground"
                    >
                      {permission}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
