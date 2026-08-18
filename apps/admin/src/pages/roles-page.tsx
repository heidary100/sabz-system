import { useRoles } from '../hooks/use-roles'
import { translateApiError } from '../lib/error-messages'
import { ROLE_LABELS } from '../lib/user-labels'
import { Button } from '../components/catalyst/button'
import { Heading, Subheading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'

export function RolesPage() {
  const { roles, loading, error, refetch } = useRoles()

  if (loading && roles.length === 0) {
    return <Loading label="در حال بارگذاری نقش‌ها…" />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
        </div>
      </div>
    )
  }

  if (roles.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Heading level={1}>نقش‌ها</Heading>
        <EmptyState title="نقشی یافت نشد" description="هیچ نقشی در سامانه تعریف نشده است." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Heading level={1}>نقش‌ها</Heading>
      <div className="grid gap-6 lg:grid-cols-2">
        {roles.map((role) => (
          <section key={role.id} className="rounded-lg border border-border bg-white p-6">
            <Subheading>{ROLE_LABELS[role.name]}</Subheading>
            <Text className="mt-3">{role.description || '—'}</Text>
            <div className="mt-4">
              <Text className="text-sm font-medium text-zinc-950">مجوزها</Text>
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
