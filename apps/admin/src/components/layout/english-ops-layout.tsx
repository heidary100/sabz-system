import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Moon, Package, ShoppingCart, Sun } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../auth/auth-provider'
import { adminDisplayName, hasDisplayName } from '../../lib/identity'
import { Button } from '../catalyst/button'

/**
 * English/LTR operations shell (pricing + orders). The Persian admin remains
 * the primary locale; this scoped view provides a real English LTR surface for
 * the two financially sensitive workflows required by the pricing spec, using
 * the same APIs, permissions and design tokens.
 */
export function EnglishOpsLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const displayName = adminDisplayName(user)
  const showsName = hasDisplayName(user)
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    const html = document.documentElement
    const previous = { lang: html.lang, dir: html.dir }
    html.lang = 'en'
    html.dir = 'ltr'
    return () => {
      html.lang = previous.lang
      html.dir = previous.dir
    }
  }, [])

  function toggleTheme(): void {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('sabz-admin-theme', next ? 'dark' : 'light')
    } catch {
      // theme persistence is best-effort
    }
  }

  const nav = [
    { to: '/en/products', label: 'Products & pricing', icon: Package },
    { to: '/en/orders', label: 'Orders', icon: ShoppingCart },
  ]

  return (
    <div
      dir="ltr"
      lang="en"
      className="ambient min-h-svh bg-background text-foreground"
    >
      <header className="sticky top-0 z-20 border-b border-border bg-surface-strong">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-2 sm:h-16 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/en/products" className="flex items-center gap-2 font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-on-primary">
                S
              </span>
              <span className="whitespace-nowrap">Sabz Ops</span>
            </Link>
            <nav
              aria-label="English operations"
              className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto"
            >
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    clsx(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
                      isActive
                        ? 'bg-primary-subtle text-primary'
                        : 'text-muted hover:bg-primary-subtle/60 hover:text-primary',
                    )
                  }
                >
                  <item.icon className="size-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-2">
            <Link
              to="/profile"
              className="hidden max-w-44 truncate rounded-lg px-2 py-1 text-xs font-medium text-foreground hover:bg-primary-subtle md:block"
              dir={showsName ? 'auto' : 'ltr'}
              title="My profile"
            >
              {displayName}
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg p-2 text-muted hover:bg-primary-subtle hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {dark ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
            </button>
            <Link to="/products">
              <Button outline>فارسی</Button>
            </Link>
            <Button
              outline
              aria-label="Sign out"
              onClick={() => {
                void logout().then(() => navigate('/login'))
              }}
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <main id="admin-main" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}
