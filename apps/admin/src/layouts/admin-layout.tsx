import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/auth-provider'
import { Button } from '../components/catalyst/button'

export function AdminLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="rule-double-edge flex w-64 shrink-0 flex-col bg-white">
        <div className="flex h-16 items-center border-b border-border px-4">
          <span className="text-sm font-bold text-foreground">پنل مدیریت سبز</span>
        </div>
        <nav className="flex flex-col gap-1 p-4">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `relative rounded-lg px-3 py-2 text-sm font-semibold ${
                isActive ? 'text-primary' : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute start-1 top-1/2 size-1.5 -translate-y-1/2 bg-primary"
                  />
                )}
                پیشخوان
              </>
            )}
          </NavLink>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
          <span className="text-sm font-medium text-dust-200">پیشخوان</span>
          <div className="flex items-center gap-4">
            <span dir="ltr" className="text-sm font-medium tabular-nums text-foreground">
              {user?.mobile}
            </span>
            <Button outline onClick={() => void logout()}>
              خروج از حساب
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
