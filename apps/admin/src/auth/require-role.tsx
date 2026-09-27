import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Loading } from '../components/ui/loading'
import { useAuth } from './auth-provider'
import type { AppRole } from '@sabz/types'

export function RequireRole({
  roles,
  children,
}: {
  roles: readonly AppRole[]
  children: ReactNode
}) {
  const { status, user } = useAuth()

  // The user object is null while the session restore is in flight.
  // Deciding before it resolves would bounce legitimate admins to
  // /access-denied (mirrors the RequireAuth loading gate).
  if (status === 'loading') {
    return <Loading label="در حال بررسی نشست…" />
  }

  const allowed = user?.roles.some((role) => roles.includes(role)) ?? false

  if (!allowed) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}
