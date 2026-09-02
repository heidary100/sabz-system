import { Menu } from 'lucide-react'
import { useAuth } from '../../auth/auth-provider'
import { Button } from '../catalyst/button'
import { IconButton } from '../ui/icon-button'
import { ThemeToggle } from '../ui/theme-toggle'

export function AppHeader({ title, onOpenMobile }: { title: string; onOpenMobile: () => void }) {
  const { user, logout } = useAuth()

  return (
    <header className="glass sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <IconButton label="باز کردن منو" onClick={onOpenMobile} className="lg:hidden">
          <Menu className="size-5" aria-hidden="true" />
        </IconButton>
        <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <ThemeToggle />
        <span dir="ltr" className="hidden text-sm font-medium tabular-nums text-muted sm:block">
          {user?.mobile}
        </span>
        <Button outline onClick={() => void logout()}>
          خروج از حساب
        </Button>
      </div>
    </header>
  )
}