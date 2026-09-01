import { useEffect, useState } from 'react'
import type { AdminUserDetail, AppRole } from '@sabz/types'
import { Alert, AlertActions, AlertBody, AlertDescription, AlertTitle } from '../catalyst/alert'
import { Button } from '../catalyst/button'
import { ErrorMessage } from '../catalyst/fieldset'
import { Text } from '../catalyst/text'
import { translateApiError } from '../../lib/error-messages'
import { ROLE_LABELS } from '../../lib/user-labels'
import { assignRole } from '../../services/users'

export function RoleAssignmentDialog({
  open,
  user,
  availableRoles,
  rolesLoading,
  rolesError,
  isSelf,
  onRetryRoles,
  onClose,
  onSuccess,
}: {
  open: boolean
  user: AdminUserDetail
  availableRoles: AppRole[]
  rolesLoading: boolean
  rolesError: unknown
  isSelf: boolean
  onRetryRoles: () => void
  onClose: () => void
  onSuccess: (updated: AdminUserDetail) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setPendingRole(null)
    }
  }, [open])

  const assignedRoles = new Set(user.roles.map((role) => role.name))

  const assignableRoles = availableRoles.filter((role) => !assignedRoles.has(role))

  const handleAssign = async (role: AppRole): Promise<void> => {
    setPendingRole(role)
    setSubmitting(true)
    setError(null)
    try {
      const updated = await assignRole(user.id, role)
      onSuccess(updated)
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
      setPendingRole(null)
    }
  }

  return (
    <Alert open={open} onClose={onClose} size="lg">
      <AlertTitle>افزودن نقش</AlertTitle>
      <AlertDescription>
        نقش‌های {user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.mobile}
      </AlertDescription>
      <AlertBody>
        <div className="space-y-5">
          <div>
            <Text className="text-sm font-medium text-foreground">نقش‌های فعلی</Text>
            {user.roles.length === 0 ? (
              <Text className="mt-1">هیچ نقشی تخصیص نیافته است.</Text>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {user.roles.map((role) => (
                  <span
                    key={role.name}
                    className="rounded-md border border-border bg-background px-2.5 py-1 text-sm font-medium text-foreground"
                  >
                    {ROLE_LABELS[role.name]}
                  </span>
                ))}
              </div>
            )}
          </div>

          {isSelf ? (
            <Text className="warning-box rounded-lg px-3 py-2 text-sm">
              امکان تغییر نقش خودتان وجود ندارد.
            </Text>
          ) : rolesError ? (
            <div className="space-y-2">
              <Text className="text-sm text-red-700 dark:text-red-400">{translateApiError(rolesError)}</Text>
              <Button outline onClick={onRetryRoles} disabled={submitting}>
                تلاش مجدد
              </Button>
            </div>
          ) : rolesLoading ? (
            <Text>در حال بارگذاری نقش‌ها…</Text>
          ) : (
            <div>
              <Text className="text-sm font-medium text-foreground">افزودن نقش</Text>
              {assignableRoles.length === 0 ? (
                <Text className="mt-1">همه نقش‌های موجود قبلاً تخصیص یافته است.</Text>
              ) : (
                <ul className="mt-2 space-y-2">
                  {assignableRoles.map((role) => (
                    <li
                      key={role}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <span className="text-sm font-medium text-foreground">
                        {ROLE_LABELS[role]}
                      </span>
                      <Button
                        color="primary"
                        onClick={() => void handleAssign(role)}
                        disabled={submitting}
                      >
                        {submitting && pendingRole === role ? 'در حال افزودن…' : 'افزودن'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <ErrorMessage>{error}</ErrorMessage>}
        </div>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={submitting}>
          بستن
        </Button>
      </AlertActions>
    </Alert>
  )
}
