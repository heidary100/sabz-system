import { LogOut, Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/auth-provider'
import { Button } from '../catalyst/button'
import { IconButton } from '../ui/icon-button'
import { ThemeToggle } from '../ui/theme-toggle'
import { NotificationBell } from '../notifications/notification-bell'
import { AdminBrandLockup } from './admin-brand-lockup'
import { PwaInstallButton } from '../pwa/pwa-install-button'

export function AppHeader({ title, onOpenMobile }: { title: string; onOpenMobile: () => void }) {
  const { user, logout } = useAuth()

  return (
    // SS-266: solid chrome — no backdrop-blur over scrolling table content.
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface-strong px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton label="باز کردن منو" onClick={onOpenMobile} className="lg:hidden">
          <Menu className="size-5" aria-hidden="true" />
        </IconButton>
        <span className="lg:hidden">
          <AdminBrandLockup collapsed size={28} />
        </span>
        <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <Link
          to="/en/products"
          className="hidden rounded-control px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-subtle sm:inline-block"
          title="English LTR operations workspace"
        >
          EN
        </Link>
        <PwaInstallButton />
        <NotificationBell />
        <ThemeToggle />
        <span dir="ltr" className="hidden text-sm font-medium tabular-nums text-muted sm:block">
          {user?.mobile}
        </span>
        <span className="hidden sm:inline-flex">
          <Button outline onClick={() => void logout()}>
            خروج از حساب
          </Button>
        </span>
        <span className="sm:hidden">
          <IconButton label="خروج از حساب" onClick={() => void logout()}>
            <LogOut className="size-5" aria-hidden="true" />
          </IconButton>
        </span>
      </div>
    </header>
  )
}