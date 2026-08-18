import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUserDetail } from '../hooks/use-user-detail'
import { useRoles } from '../hooks/use-roles'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime } from '../lib/format'
import { ROLE_LABELS } from '../lib/user-labels'
import type { AdminUserDetail, AppRole } from '@sabz/types'
import { useAuth } from '../auth/auth-provider'
import { RoleAssignmentDialog } from '../components/users/role-assignment-dialog'
import { RoleRemovalDialog } from '../components/users/role-removal-dialog'
import { SuspendDialog } from '../components/users/suspend-dialog'
import { UnlockDialog } from '../components/users/unlock-dialog'
import { UnsuspendDialog } from '../components/users/unsuspend-dialog'
import { UserStatusBadge } from '../components/users/user-status-badge'
import { Button } from '../components/catalyst/button'
import { Heading, Subheading } from '../components/catalyst/heading'
import { Text } from '../components/catalyst/text'
import { Badge } from '../components/catalyst/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'

type DialogName = 'suspend' | 'unsuspend' | 'unlock' | 'roles'

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-dust-200">{label}</dt>
      <dd className="text-sm text-foreground">{value || '—'}</dd>
    </div>
  )
}

function roleName(user: AdminUserDetail): string {
  return user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.roles.includes('ADMIN') ?? false
  const { user, loading, error, refetch } = useUserDetail(id ?? '')
  const {
    roles,
    loading: rolesLoading,
    error: rolesError,
    refetch: refetchRoles,
  } = useRoles(isAdmin)
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [removeRole, setRemoveRole] = useState<AppRole | null>(null)

  if (loading && !user) {
    return <Loading label="در حال بارگذاری کاربر…" />
  }

  if (error && !user) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link to="/users" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست کاربران
          </Link>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <EmptyState
          title="کاربر یافت نشد"
          description="این کاربر در دسترس نیست."
          actions={
            <Link to="/users">
              <Button outline>بازگشت به فهرست</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const isSelf = currentUser?.id === user.id
  const targetIsAdmin = user.roles.some((role) => role.name === 'ADMIN')
  const canManageLifecycle = isAdmin || !targetIsAdmin

  const availableRoles = roles.map((role) => role.name)

  const handleSuccess = (): void => {
    setDialog(null)
    void refetch()
  }

  const handleConflict = (): void => {
    void refetch()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link to="/users" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست کاربران
          </Link>
          <div className="flex items-center gap-3">
            <Heading level={1}>{roleName(user)}</Heading>
            <UserStatusBadge status={user.status} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user.status === 'ACTIVE' && !isSelf && canManageLifecycle && (
            <Button outline onClick={() => setDialog('suspend')}>
              تعلیق
            </Button>
          )}
          {user.status === 'SUSPENDED' && canManageLifecycle && (
            <Button outline onClick={() => setDialog('unsuspend')}>
              رفع تعلیق
            </Button>
          )}
          {user.status === 'LOCKED' && isAdmin && (
            <Button outline onClick={() => setDialog('unlock')}>
              باز کردن قفل
            </Button>
          )}
          {isAdmin && !isSelf && (
            <Button color="primary" onClick={() => setDialog('roles')}>
              افزودن نقش
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>هویت</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="موبایل" value={user.mobile} />
            <InfoItem label="ایمیل" value={user.email} />
            <InfoItem label="تاریخ ایجاد" value={formatDateTime(user.createdAt)} />
            <InfoItem label="تاریخ به‌روزرسانی" value={formatDateTime(user.updatedAt)} />
            <InfoItem label="آخرین ورود" value={formatDateTime(user.lastLoginAt)} />
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>پروفایل</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="نام" value={user.profile?.firstName ?? null} />
            <InfoItem label="نام خانوادگی" value={user.profile?.lastName ?? null} />
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>نقش‌ها</Subheading>
          {user.roles.length === 0 ? (
            <Text className="mt-4">هیچ نقشی تخصیص نیافته است.</Text>
          ) : (
            <ul className="mt-4 space-y-2">
              {user.roles.map((role) => (
                <li
                  key={role.name}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <Badge color={role.name === 'ADMIN' ? 'green' : 'zinc'}>
                      {ROLE_LABELS[role.name]}
                    </Badge>
                    <Text className="mt-1 text-xs text-zinc-500">
                      تخصیص: {formatDateTime(role.assignedAt)}
                    </Text>
                  </div>
                  {isAdmin && !isSelf && role.name !== 'ADMIN' && (
                    <Button outline onClick={() => setRemoveRole(role.name)}>
                      حذف نقش
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>همکاری</Subheading>
          {user.partner ? (
            <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Link to={`/partners/${user.partner.id}`} className="text-sm font-medium text-primary hover:underline">
                  {user.partner.businessName}
                </Link>
              </div>
              <InfoItem label="وضعیت تأیید" value={user.partner.approvalStatus} />
            </dl>
          ) : (
            <Text className="mt-4">هیچ سابقه همکاری برای این کاربر ثبت نشده است.</Text>
          )}
        </section>
      </div>

      <SuspendDialog
        open={dialog === 'suspend'}
        user={user}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
        onConflict={handleConflict}
      />
      <UnsuspendDialog
        open={dialog === 'unsuspend'}
        user={user}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
        onConflict={handleConflict}
      />
      <UnlockDialog
        open={dialog === 'unlock'}
        user={user}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
        onConflict={handleConflict}
      />
      <RoleAssignmentDialog
        open={dialog === 'roles'}
        user={user}
        availableRoles={availableRoles}
        rolesLoading={rolesLoading}
        rolesError={rolesError}
        isSelf={isSelf}
        onRetryRoles={() => void refetchRoles()}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
      />
      <RoleRemovalDialog
        open={removeRole !== null}
        user={user}
        role={removeRole ?? 'CUSTOMER'}
        onClose={() => setRemoveRole(null)}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
