// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './use-media-query'

function Harness() {
  const desktop = useMediaQuery('(min-width: 64rem)')
  return <p>{desktop ? 'desktop' : 'mobile'}</p>
}

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  let matches = initialMatches
  const media = {
    get matches() {
      return matches
    },
    media: '(min-width: 64rem)',
    onchange: null,
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener)
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener)
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    },
    dispatchEvent: () => true,
  }
  const matchMedia = vi.fn(() => media)
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  })
  return {
    matchMedia,
    listeners,
    setMatches(next: boolean) {
      matches = next
      listeners.forEach((listener) =>
        listener({ matches: next } as MediaQueryListEvent),
      )
    },
    restore() {
      delete (window as { matchMedia?: unknown }).matchMedia
    },
  }
}

describe('useMediaQuery', () => {
  afterEach(cleanup)

  it('updates on media changes and removes its listener on unmount', () => {
    const media = installMatchMedia(true)
    try {
      const { unmount } = render(<Harness />)
      expect(screen.getByText('desktop')).toBeTruthy()
      expect(media.matchMedia).toHaveBeenCalledWith('(min-width: 64rem)')

      act(() => media.setMatches(false))
      expect(screen.getByText('mobile')).toBeTruthy()

      act(() => media.setMatches(true))
      expect(screen.getByText('desktop')).toBeTruthy()

      expect(media.listeners.size).toBe(1)
      unmount()
      expect(media.listeners.size).toBe(0)
    } finally {
      media.restore()
    }
  })

  it('falls back safely when matchMedia is unavailable', () => {
    delete (window as { matchMedia?: unknown }).matchMedia
    render(<Harness />)
    expect(screen.getByText('desktop')).toBeTruthy()
  })
})
