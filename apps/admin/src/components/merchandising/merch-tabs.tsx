import clsx from 'clsx'
import { NavLink } from 'react-router-dom'

export interface MerchTab {
  to: string
  label: string
  /** Only the overview tab is an exact route; the rest are section roots. */
  end?: boolean
}

export const MERCH_TABS: readonly MerchTab[] = [
  { to: '/merchandising', label: 'نمای کلی', end: true },
  { to: '/merchandising/homepage', label: 'صفحه اصلی' },
  { to: '/merchandising/publications', label: 'انتشارها' },
  { to: '/merchandising/campaigns', label: 'کمپین‌ها' },
  { to: '/merchandising/media', label: 'کتابخانه رسانه' },
]

/**
 * Secondary navigation inside the merchandising area. The global sidebar has
 * one «بازاریابی» entry; these tabs keep the five merchandising sections
 * together without turning them into five flat global navigation items.
 */
export function MerchTabs() {
  return (
    <nav
      aria-label="بخش‌های بازاریابی"
      className="flex w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1"
    >
      {MERCH_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            clsx(
              'focus-ring flex min-h-11 shrink-0 items-center rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-primary-subtle text-primary shadow-[inset_0_0_0_1px_var(--color-primary-border)]'
                : 'text-muted hover:bg-primary-subtle/60 hover:text-primary',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
