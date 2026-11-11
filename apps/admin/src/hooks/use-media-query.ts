import { useEffect, useState } from 'react'

/**
 * SSR-safe media query hook. When `matchMedia` is unavailable (older browsers
 * or the default jsdom test environment) the fallback is returned so the
 * desktop layout remains the stable default.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return fallback
    }
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }
    const media = window.matchMedia(query)
    const update = (): void => setMatches(media.matches)
    update()
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update)
      return () => media.removeEventListener('change', update)
    }
    // Safari < 14 fallback.
    media.addListener?.(update)
    return () => media.removeListener?.(update)
  }, [query, fallback])

  return matches
}
