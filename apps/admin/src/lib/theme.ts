import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'sabz-admin-theme'

export function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'dark' || stored === 'light' ? stored : null
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark'
    }
    return 'light'
  })

  useEffect(() => {
    const fallback = (event: MediaQueryListEvent): void => {
      if (!getStoredTheme()) {
        const next = event.matches ? 'dark' : 'light'
        setTheme(next)
        applyTheme(next)
      }
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', fallback)
    return () => media.removeEventListener('change', fallback)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      setStoredTheme(next)
      return next
    })
  }, [])

  return { theme, toggleTheme }
}