// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Link,
  RouterProvider,
  createMemoryRouter,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useDirtyNavigationGuard } from './use-dirty-navigation-guard'
import { HomepageUnsavedChangesDialog } from '../components/merchandising/homepage/homepage-unsaved-changes-dialog'

function LocationProbe() {
  const location = useLocation()
  return <p>مسیر: {location.pathname}</p>
}

function EditorHarness({ initialDirty = true }: { initialDirty?: boolean }) {
  const [dirty, setDirty] = useState(initialDirty)
  const navigate = useNavigate()
  const guard = useDirtyNavigationGuard(dirty)

  useEffect(() => {
    const save = (): void => setDirty(false)
    window.addEventListener('sabz-test-save', save)
    return () => window.removeEventListener('sabz-test-save', save)
  }, [])

  return (
    <div>
      <Link to="/other">رفتن</Link>
      <button type="button" onClick={() => navigate(-1)}>
        بازگشت
      </button>
      <button type="button" onClick={() => navigate(1)}>
        جلو
      </button>
      <button type="button" onClick={() => setDirty(false)}>
        ذخیره
      </button>
      <LocationProbe />
      <HomepageUnsavedChangesDialog
        open={guard.blocked}
        onStay={guard.reset}
        onLeave={guard.proceed}
      />
    </div>
  )
}

function OtherPage() {
  return (
    <div>
      <p>صفحه دیگر</p>
      <LocationProbe />
    </div>
  )
}

function renderGuard({
  initialDirty = true,
  initialEntries = ['/editor'],
  initialIndex,
}: {
  initialDirty?: boolean
  initialEntries?: string[]
  initialIndex?: number
} = {}) {
  const router = createMemoryRouter(
    [
      { path: '/editor', element: <EditorHarness initialDirty={initialDirty} /> },
      { path: '/other', element: <OtherPage /> },
    ],
    { initialEntries, initialIndex },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

function path() {
  return screen.getByText(/^مسیر:/).textContent
}

describe('useDirtyNavigationGuard with the data-router blocker', () => {
  afterEach(cleanup)

  it('allows clean navigation without a dialog', async () => {
    renderGuard({ initialDirty: false })
    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))

    expect(await screen.findByText('صفحه دیگر')).toBeTruthy()
    expect(path()).toBe('مسیر: /other')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('blocks dirty PUSH navigation, preserves the route on cancel, then proceeds', async () => {
    renderGuard()

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(path()).toBe('مسیر: /editor')

    fireEvent.click(screen.getByRole('button', { name: 'ماندن در ویرایشگر' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(path()).toBe('مسیر: /editor')

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'خروج بدون ذخیره' }))

    expect(await screen.findByText('صفحه دیگر')).toBeTruthy()
    expect(path()).toBe('مسیر: /other')
  })

  it('blocks dirty Back/POP navigation and restores the editor on cancel', async () => {
    renderGuard({ initialEntries: ['/other', '/editor'], initialIndex: 1 })

    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await waitFor(() => expect(path()).toBe('مسیر: /editor'))

    fireEvent.click(screen.getByRole('button', { name: 'ماندن در ویرایشگر' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(path()).toBe('مسیر: /editor')

    fireEvent.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'خروج بدون ذخیره' }))

    expect(await screen.findByText('صفحه دیگر')).toBeTruthy()
    expect(path()).toBe('مسیر: /other')
  })

  it('blocks dirty Forward/POP navigation and proceeds in the requested direction', async () => {
    renderGuard({ initialEntries: ['/editor', '/other'], initialIndex: 0 })

    fireEvent.click(screen.getByRole('button', { name: 'جلو' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    await waitFor(() => expect(path()).toBe('مسیر: /editor'))

    fireEvent.click(screen.getByRole('button', { name: 'خروج بدون ذخیره' }))
    expect(await screen.findByText('صفحه دیگر')).toBeTruthy()
    expect(path()).toBe('مسیر: /other')
  })

  it('keeps one dialog during repeated attempts while blocked', async () => {
    const { router } = renderGuard()

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    act(() => {
      void router.navigate('/other')
    })
    act(() => {
      void router.navigate('/other')
    })

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(path()).toBe('مسیر: /editor')

    fireEvent.click(screen.getByRole('button', { name: 'خروج بدون ذخیره' }))
    expect(await screen.findByText('صفحه دیگر')).toBeTruthy()
  })

  it('closes the blocker and cancels pending navigation after a successful save', async () => {
    renderGuard()

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    act(() => {
      window.dispatchEvent(new Event('sabz-test-save'))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(path()).toBe('مسیر: /editor')

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(await screen.findByText('صفحه دیگر')).toBeTruthy()
    expect(path()).toBe('مسیر: /other')
  })

  it('deletes the blocker on unmount so later navigation is not intercepted', async () => {
    const { router, unmount } = renderGuard()

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    unmount()
    await act(async () => {
      await router.navigate('/other')
    })

    expect(router.state.location.pathname).toBe('/other')
  })
})
