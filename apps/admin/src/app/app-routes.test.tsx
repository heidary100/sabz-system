// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  status: 'authenticated' as 'authenticated' | 'anonymous' | 'loading',
  roles: [] as string[],
}))

vi.mock('../auth/auth-provider', () => ({
  ADMIN_ROLES: ['OPERATOR', 'ADMIN'],
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    status: auth.status,
    user:
      auth.status === 'authenticated'
        ? {
            id: 'user-1',
            mobile: '09120000000',
            status: 'ACTIVE',
            roles: auth.roles,
          }
        : null,
    isAdmin: auth.roles.includes('ADMIN'),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/use-homepage-draft', () => ({
  useHomepageDraft: () => ({
    serverDraft: null,
    sections: [],
    revision: null,
    schemaVersion: null,
    serverUpdatedAt: null,
    loading: false,
    error: null,
    dirty: false,
    saving: false,
    saveError: null,
    saveMessage: null,
    conflict: null,
    validating: false,
    validation: null,
    validationTarget: null,
    validationOutdated: false,
    validationError: null,
    updateSections: () => {},
    applyValidationResult: () => {},
    load: () => {},
    save: () => Promise.resolve(false),
    validate: () => Promise.resolve(),
  }),
}))

vi.mock('../hooks/use-homepage-publication', () => ({
  useHomepagePublication: () => ({
    current: null,
    currentLoading: false,
    currentError: null,
    publishing: false,
    refreshCurrent: vi.fn(),
    publish: vi.fn(),
  }),
}))

vi.mock('../hooks/use-merchandising-overview', () => ({
  useMerchandisingOverview: () => ({
    currentPublication: {
      data: null,
      loading: false,
      error: null,
      reload: vi.fn(),
    },
    scheduledPublications: {
      data: null,
      loading: false,
      error: null,
      reload: vi.fn(),
    },
    draft: { data: null, loading: false, error: null, reload: vi.fn() },
    draftValidation: {
      data: null,
      loading: false,
      error: null,
      reload: vi.fn(),
    },
    campaigns: { data: null, loading: false, error: null, reload: vi.fn() },
    media: { data: null, loading: false, error: null, reload: vi.fn() },
    refreshAll: vi.fn(),
  }),
}))

import App from './App'
import { NAV_ITEMS } from '../components/layout/sidebar'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function openAs(
  path: string,
  status: 'authenticated' | 'anonymous' | 'loading',
  roles: string[],
) {
  auth.status = status
  auth.roles = roles
  window.history.replaceState({}, '', path)
  render(<App />)
}

describe('merchandising routes (SS-273)', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState({}, '', '/')
  })

  it('lets OPERATOR open the merchandising overview with one global entry', () => {
    openAs('/merchandising', 'authenticated', ['OPERATOR'])

    expect(
      NAV_ITEMS.filter((item) => item.to.startsWith('/merchandising')),
    ).toHaveLength(1)
    expect(screen.getAllByText('بازاریابی').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('navigation', { name: 'بخش‌های بازاریابی' }),
    ).toBeTruthy()
    expect(
      within(
        screen.getByRole('navigation', { name: 'بخش‌های بازاریابی' }),
      ).getByRole('link', { name: 'کمپین‌ها' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'نمای کلی بازاریابی' }),
    ).toBeTruthy()
    expect(screen.getByText('نسخه منتشرشده جاری')).toBeTruthy()
    expect(screen.getByText('دسترسی سریع')).toBeTruthy()
  })

  it('lets ADMIN open a nested merchandising tab with the correct active state', () => {
    openAs('/merchandising/homepage', 'authenticated', ['ADMIN'])

    expect(screen.getByRole('heading', { name: 'صفحه اصلی' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'صفحه اصلی' }).getAttribute(
        'aria-current',
      ),
    ).toBe('page')
  })

  it('opens the new-campaign editor for permitted roles', () => {
    openAs('/merchandising/campaigns/new', 'authenticated', ['OPERATOR'])

    expect(screen.getByRole('heading', { name: 'کمپین جدید' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ایجاد و ادامه' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'کمپین‌ها' }).getAttribute(
        'aria-current',
      ),
    ).toBe('page')
  })

  it('redirects an unauthenticated visitor to login', async () => {
    openAs('/merchandising', 'anonymous', [])

    await waitFor(() => expect(window.location.pathname).toBe('/login'))
    expect(
      screen.getByText('برای ورود، شماره موبایل خود را وارد کنید.'),
    ).toBeTruthy()
  })

  it('keeps ADMIN-only route guards unchanged for OPERATOR', async () => {
    openAs('/roles', 'authenticated', ['OPERATOR'])

    await waitFor(() =>
      expect(window.location.pathname).toBe('/access-denied'),
    )
    expect(screen.getByText('دسترسی غیرمجاز')).toBeTruthy()
  })
})
