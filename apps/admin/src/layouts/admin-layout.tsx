import { useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/auth-provider'
import { AppHeader } from '../components/layout/app-header'
import { NAV_ITEMS, readSidebarPreference, Sidebar, writeSidebarPreference } from '../components/layout/sidebar'

export function AdminLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const [collapsed, setCollapsed] = useState(readSidebarPreference)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      writeSidebarPreference(next)
      return next
    })
  }, [])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const activeItem = NAV_ITEMS.find(
    (item) =>
      location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
  )
  const title = activeItem?.label ?? 'پیشخوان'

  return (
    <div className="ambient flex min-h-svh">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        isAdmin={isAdmin}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader title={title} onOpenMobile={() => setMobileOpen(true)} />
        {/* SS-268: no max-width here — each page owns its width via its own
            wrapper (full for data tables, capped for forms/details), so a
            table page can use the whole content column without the old
            double nesting (max-w-7xl shell + max-w-6xl page). */}
        <main className="w-full flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}