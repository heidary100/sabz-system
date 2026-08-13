import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './auth-provider'
import type { AppRole } from '@sabz/types'

export function RequireRole({
  roles,
  children,
}: {
  roles: readonly AppRole[]
  children: ReactNode
}) {
  const { user } = useAuth()

  const allowed = user?.roles.some((role) => roles.includes(role)) ?? false

  if (!allowed) {
    return <Navigate to="/access-denied" replace />
  }

  return <>{children}</>
}
