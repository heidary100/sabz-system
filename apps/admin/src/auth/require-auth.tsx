import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loading } from '../components/ui/loading'
import { useAuth } from './auth-provider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <Loading label="در حال بررسی نشست…" />
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <>{children}</>
}
