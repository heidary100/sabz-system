import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button } from '../components/catalyst/button'
import { Loading } from '../components/ui/loading'
import { useAuth } from './auth-provider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, retrySession } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <Loading label="در حال بررسی نشست…" />
  }

  if (status === 'unavailable') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-4" dir="rtl">
        <div className="surface-card w-full max-w-md rounded-2xl p-8 text-center" role="alert">
          <p className="text-lg font-bold text-foreground">اتصال به سرور برقرار نشد</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            نشست شما حفظ شده است. لطفاً اتصال شبکه را بررسی کنید و دوباره تلاش کنید.
          </p>
          <Button color="primary" className="mt-5" onClick={() => void retrySession()}>
            تلاش دوباره
          </Button>
        </div>
      </div>
    )
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
