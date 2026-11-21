import * as Headless from '@headlessui/react'
import clsx from 'clsx'
import { MessageCircle,
  Bell,
  Briefcase,
  Boxes,
  ClipboardList,
  Coins,
  FileText,
  FolderTree,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Package,
  PanelRightClose,
  PanelRightOpen,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tag,
  Undo2,
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Button } from '../catalyst/button'
import { Tooltip } from '../ui/tooltip'
import { AdminBrandLockup } from './admin-brand-lockup'
import { PwaInstallButton } from '../pwa/pwa-install-button'

const SIDEBAR_STORAGE_KEY = 'sabz-admin-sidebar'

export const NAV_ITEMS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/dashboard', label: 'پیشخوان', icon: LayoutDashboard },
  { to: '/merchandising', label: 'بازاریابی', icon: Megaphone },
  { to: '/products', label: 'محصولات', icon: Package },
  { to: '/categories', label: 'دسته‌بندی‌ها', icon: FolderTree },
  { to: '/attributes', label: 'ویژگی‌ها', icon: Tag },
  { to: '/brands', label: 'برندها', icon: Tag },
  { to: '/inventory', label: 'موجودی', icon: Boxes },
  { to: '/warehouses', label: 'انبارها', icon: Warehouse },
  { to: '/orders', label: 'سفارش‌ها', icon: ShoppingCart },
  { to: '/returns', label: 'مرجوعی‌ها', icon: Undo2 },
  { to: '/notifications', label: 'اعلان‌ها', icon: Bell },
  { to: '/chat', label: 'گفتگوی پشتیبانی', icon: MessageCircle },
  { to: '/currency', label: 'نرخ ارز', icon: Coins },
  { to: '/settings/footer', label: 'پاورقی فروشگاه', icon: PanelRightOpen },
  { to: '/rfq', label: 'استعلام‌ها', icon: FileText },
  { to: '/reviews', label: 'نقدها', icon: Star },
  { to: '/blog', label: 'وبلاگ', icon: Newspaper },
  { to: '/partners', label: 'درخواست‌های همکاری', icon: Briefcase },
  { to: '/users', label: 'کاربران', icon: Users },
  { to: '/roles', label: 'نقش‌ها', icon: ShieldCheck },
  { to: '/audit', label: 'گزارش فعالیت‌ها', icon: ClipboardList },
]

const NAV_GROUPS: Array<{ label: string; tos: string[] }> = [
  { label: 'نمای کلی', tos: ['/dashboard'] },
  {
    label: 'کاتالوگ',
    tos: ['/merchandising', '/products', '/categories', '/attributes', '/brands', '/inventory', '/warehouses'],
  },
  { label: 'فروش', tos: ['/orders', '/returns', '/rfq'] },
  { label: 'پشتیبانی', tos: ['/notifications', '/chat'] },
  { label: 'محتوا', tos: ['/reviews', '/blog'] },
  {
    label: 'تنظیمات و دسترسی',
    tos: ['/currency', '/settings/footer', '/partners', '/users', '/roles', '/audit'],
  },
]

export function readSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

export function writeSidebarPreference(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // Persistence is best-effort; the sidebar still works without it.
  }
}

function BrandArea({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={clsx(
        'flex h-16 shrink-0 items-center border-b border-border px-4',
        collapsed && 'justify-center px-0',
      )}
    >
      <AdminBrandLockup collapsed={collapsed} />
    </div>
  )
}

function NavLinkItem({ item, collapsed }: { item: (typeof NAV_ITEMS)[number]; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-primary-subtle text-primary shadow-[inset_0_0_0_1px_var(--color-primary-border)]'
            : 'text-muted hover:bg-primary-subtle/60 hover:text-primary dark:hover:bg-primary-subtle',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-primary"
            />
          )}
          <item.icon className="size-5 shrink-0" aria-hidden="true" />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) {
    return link
  }

  return (
    <Tooltip label={item.label}>
      {link}
    </Tooltip>
  )
}

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
  isAdmin,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onCloseMobile: () => void
  isAdmin: boolean
}) {
  const location = useLocation()

  useEffect(() => {
    onCloseMobile()
  }, [location.pathname, onCloseMobile])

  const visibleItems = NAV_ITEMS.filter(
    (item) => isAdmin || (item.to !== '/roles' && item.to !== '/warehouses'),
  )

  const renderNav = (drawerCollapsed: boolean) => {
    const grouped = NAV_GROUPS.map((group) => ({
      ...group,
      items: visibleItems.filter((item) => group.tos.includes(item.to)),
    })).filter((group) => group.items.length > 0)

    return (
      <nav aria-label="ناوبری اصلی" className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {grouped.map((group) => (
          <div key={group.label} className="space-y-1">
            {!drawerCollapsed && (
              <p className="px-3 pt-1 text-[10px] font-semibold tracking-wide text-muted">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLinkItem key={item.to} item={item} collapsed={drawerCollapsed} />
            ))}
          </div>
        ))}
      </nav>
    )
  }

  return (
    <>
      <aside
        className={clsx(
          // SS-266: solid chrome — backdrop-blur on a sticky rail recomputes
          // every frame table rows scroll beneath it (mobile drawer below
          // keeps glass: it is a scrimmed overlay, not over live content).
          'rule-double-edge bg-surface-strong sticky top-0 z-30 hidden h-svh shrink-0 flex-col lg:flex',
          'motion-reduce:transition-none transition-[width] duration-300 ease-out',
          collapsed ? 'w-[4.75rem]' : 'w-64',
        )}
      >
        <BrandArea collapsed={collapsed} />
        {renderNav(collapsed)}
        <div className="mt-auto shrink-0 border-t border-border p-3">
          <Button
            plain
            className="w-full"
            aria-label={collapsed ? 'باز کردن نوار کناری' : 'بستن نوار کناری'}
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <PanelRightOpen data-slot="icon" className="size-5" />
            ) : (
              <PanelRightClose data-slot="icon" className="size-5" />
            )}
            {!collapsed && 'بستن نوار'}
          </Button>
        </div>
      </aside>

      <Headless.Dialog open={mobileOpen} onClose={onCloseMobile} className="lg:hidden">
        <Headless.DialogBackdrop
          transition
          className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm transition duration-300 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
        />
        <div className="fixed inset-0 z-50 flex justify-start">
          <Headless.DialogPanel
            transition
            className="rule-double-edge glass flex h-full w-72 max-w-[85vw] translate-x-0 flex-col transition duration-300 ease-out data-closed:translate-x-full data-enter:ease-out data-leave:ease-in"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-border ps-4 pe-2">
              <AdminBrandLockup />
              <Button
                plain
                className="shrink-0"
                aria-label="بستن منو"
                onClick={onCloseMobile}
              >
                <X data-slot="icon" className="size-5" />
              </Button>
            </div>
            {renderNav(false)}
            <div className="shrink-0 border-t border-border p-3">
              <PwaInstallButton mobile />
            </div>
          </Headless.DialogPanel>
        </div>
      </Headless.Dialog>
    </>
  )
}