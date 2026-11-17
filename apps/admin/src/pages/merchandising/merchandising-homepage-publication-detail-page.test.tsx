// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomepagePublicationDto } from '@sabz/types'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { MerchandisingHomepagePublicationDetailPage } from './merchandising-homepage-publication-detail-page'
import { getHomepagePublication } from '../../services/merchandising'

const auth = vi.hoisted(() => ({ roles: ['ADMIN'] as string[] }))
const cancelledResult = vi.hoisted(() => ({
  id: 'publication-1',
  version: 4,
  status: 'CANCELLED' as const,
  publishAt: null,
  publishedAt: null,
  sourceDraftRevision: 3,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: null,
  createdAt: '2026-11-10T10:05:00.000Z',
  schemaVersion: 1,
  sections: [],
}))

const rolledBackResult = vi.hoisted(() => ({
  id: 'publication-new',
  version: 7,
  status: 'PUBLISHED' as const,
  publishAt: null,
  publishedAt: '2026-11-10T12:00:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: 'publication-old',
  note: 'بازگردانی از نسخه ۳',
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T12:00:00.000Z',
  schemaVersion: 1,
  sections: [],
}))

const rollbackSourceResult = vi.hoisted(() => ({
  id: 'publication-old',
  version: 3,
  status: 'SUPERSEDED' as const,
  publishAt: null,
  publishedAt: '2026-10-10T10:05:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-10-10T10:05:00.000Z',
}))

vi.mock('../../auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', roles: auth.roles },
    isAdmin: true,
  }),
}))

vi.mock(
  '../../components/merchandising/homepage/homepage-publication-audit-panel',
  () => ({
    HomepagePublicationAuditPanel: () => null,
  }),
)

vi.mock(
  '../../components/merchandising/homepage/homepage-publication-cancel-dialog',
  () => ({
    HomepagePublicationCancelDialog: ({
      open,
      publication,
      onCancelled,
    }: {
      open: boolean
      publication: HomepagePublicationDto | null
      onCancelled: (publication: HomepagePublicationDto) => void
    }) =>
      open ? (
        <div>
          <p>شناسه لغو: {publication?.id}</p>
          <button
            type="button"
            onClick={() => onCancelled(cancelledResult)}
          >
            شبیه‌سازی لغو موفق
          </button>
        </div>
      ) : null,
  }),
)

vi.mock(
  '../../components/merchandising/homepage/homepage-publication-rollback-dialog',
  () => ({
    HomepagePublicationRollbackDialog: ({
      open,
      publication,
      onRolledBack,
      onConflict,
    }: {
      open: boolean
      publication: HomepagePublicationDto | null
      onRolledBack: (
        publication: typeof rolledBackResult,
        source: typeof rollbackSourceResult,
      ) => void
      onConflict: () => void
    }) =>
      open ? (
        <div>
          <p>شناسه بازگردانی: {publication?.id}</p>
          <button
            type="button"
            onClick={() =>
              onRolledBack(rolledBackResult, rollbackSourceResult)
            }
          >
            شبیه‌سازی بازگردانی موفق
          </button>
          <button type="button" onClick={onConflict}>
            شبیه‌سازی تعارض بازگردانی
          </button>
        </div>
      ) : null,
  }),
)

vi.mock('../../services/merchandising', () => ({
  getHomepagePublication: vi.fn(),
}))

const mockGet = vi.mocked(getHomepagePublication)

const publication: HomepagePublicationDto = {
  id: 'publication-1',
  version: 4,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T10:05:00.000Z',
  sourceDraftRevision: 3,
  rollbackFromPublicationId: null,
  note: 'ثبت‌شده برای بازبینی تیم',
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T10:05:00.000Z',
  schemaVersion: 1,
  sections: [
    {
      key: 'trust-main',
      type: 'TRUST_STRIP',
      order: 0,
      isVisible: true,
      settings: { items: [] },
    },
  ],
}

const scheduledPublication: HomepagePublicationDto = {
  ...publication,
  status: 'SCHEDULED',
  publishAt: '2030-01-01T08:30:00.000Z',
  publishedAt: null,
  publishedBy: null,
}

const supersededPublication: HomepagePublicationDto = {
  ...publication,
  id: 'publication-old',
  version: 3,
  status: 'SUPERSEDED',
  publishedAt: '2026-10-10T10:05:00.000Z',
}

const publicationB: HomepagePublicationDto = {
  ...publication,
  id: 'publication-2',
  version: 9,
  status: 'SUPERSEDED',
  note: 'نسخه ب',
}

const publicationBScheduled: HomepagePublicationDto = {
  ...publicationB,
  status: 'SCHEDULED',
  publishAt: '2030-01-01T08:30:00.000Z',
  publishedAt: null,
  publishedBy: null,
}

const rolledBackPublication: HomepagePublicationDto = {
  ...publication,
  id: 'publication-new',
  version: 7,
  status: 'PUBLISHED',
  publishedAt: '2026-11-10T12:00:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: 'publication-old',
  note: 'بازگردانی از نسخه ۳',
}

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/merchandising/publications/publication-1',
          state,
        },
      ]}
    >
      <Routes>
        <Route
          path="/merchandising/publications/:id"
          element={<MerchandisingHomepagePublicationDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function NavigationHarness() {
  const navigate = useNavigate()
  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/merchandising/publications/publication-1')}
      >
        رفتن به A
      </button>
      <button
        type="button"
        onClick={() => navigate('/merchandising/publications/publication-2')}
      >
        رفتن به B
      </button>
      <Routes>
        <Route
          path="/merchandising/publications/:id"
          element={<MerchandisingHomepagePublicationDetailPage />}
        />
      </Routes>
    </div>
  )
}

function renderNavigable(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/merchandising/publications/publication-1',
          state,
        },
      ]}
    >
      <NavigationHarness />
    </MemoryRouter>,
  )
}

describe('homepage publication detail page (SS-279)', () => {
  beforeEach(() => {
    auth.roles = ['ADMIN']
    mockGet.mockReset()
    mockGet.mockResolvedValue(publication)
  })

  afterEach(cleanup)

  it('shows real server metadata and the success state after publishing', async () => {
    renderPage({
      justPublished: true,
      publication,
      expectedRevision: 3,
      revisionMismatch: false,
    })

    expect(
      screen.getByText('صفحه اصلی با موفقیت منتشر شد.'),
    ).toBeTruthy()
    expect(screen.getAllByText(/نسخه ۴/).length).toBeGreaterThan(0)
    expect(screen.getByText('یادداشت انتشار')).toBeTruthy()
    expect(screen.getByText(/پیش‌نویس منبع/)).toBeTruthy()
    expect(screen.getByText('نوار اعتماد')).toBeTruthy()
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('publication-1'))
  })

  it('warns when the published revision differs from the confirmed revision', async () => {
    renderPage({
      justPublished: true,
      publication,
      expectedRevision: 2,
      revisionMismatch: true,
    })

    expect(
      screen.getByText('نسخه منتشرشده با نسخه تأییدشده شما یکسان نیست.'),
    ).toBeTruthy()
    expect(
      screen.getByText(/تغییرات محلی شما حفظ شده‌اند/),
    ).toBeTruthy()
  })

  it('shows an error when the publication cannot be loaded', async () => {
    mockGet.mockRejectedValue(new Error('network'))
    renderPage()

    await waitFor(() =>
      expect(
        screen.getByText('خطایی رخ داد. دوباره تلاش کنید.'),
      ).toBeTruthy(),
    )
  })

  it('does not promise a storefront preview or cache propagation', () => {
    renderPage({ justPublished: true, publication })
    expect(
      screen.getByText(/پیش‌نمایش پیش‌نویس منتشرنشده یا لینک\s+فروشگاه/),
    ).toBeTruthy()
    expect(
      screen.getByText(/پاک‌سازی فوری cache یا CDN/),
    ).toBeTruthy()
  })

  it('shows scheduled metadata explicitly in Tehran time and offers ADMIN cancellation', async () => {
    mockGet.mockResolvedValue(scheduledPublication)
    renderPage({
      justScheduled: true,
      publication: scheduledPublication,
    })

    expect(
      screen.getByText('انتشار صفحه اصلی زمان‌بندی شد.'),
    ).toBeTruthy()
    expect(screen.getByText(/زمان زمان‌بندی/)).toBeTruthy()
    expect(screen.getAllByText(/به وقت تهران/).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: 'لغو انتشار زمان‌بندی‌شده' }),
    ).toBeTruthy()
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('publication-1'),
    )
  })

  it('hides cancellation from OPERATOR', async () => {
    auth.roles = ['OPERATOR']
    mockGet.mockResolvedValue(scheduledPublication)
    renderPage({ publication: scheduledPublication })

    await waitFor(() =>
      expect(screen.getByText('زمان زمان‌بندی')).toBeTruthy(),
    )
    expect(
      screen.queryByRole('button', { name: 'لغو انتشار زمان‌بندی‌شده' }),
    ).toBeNull()
  })

  it('refreshes to the cancelled state after a confirmed cancellation', async () => {
    mockGet.mockResolvedValue(scheduledPublication)
    renderPage({ publication: scheduledPublication })

    await waitFor(() =>
      expect(screen.getByText('زمان زمان‌بندی')).toBeTruthy(),
    )
    mockGet.mockResolvedValue({
      ...scheduledPublication,
      status: 'CANCELLED',
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'لغو انتشار زمان‌بندی‌شده' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی لغو موفق' }),
    )

    expect(
      screen.getByText(/انتشار زمان‌بندی‌شده نسخه ۴ لغو شد/),
    ).toBeTruthy()
    await waitFor(() => expect(screen.getByText('لغوشده')).toBeTruthy())
  })

  it('shows rollback only for ADMIN on a SUPERSEDED publication', async () => {
    mockGet.mockResolvedValue(supersededPublication)
    renderPage({ publication: supersededPublication })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'بازگردانی این نسخه' }),
      ).toBeTruthy(),
    )

    cleanup()
    auth.roles = ['OPERATOR']
    renderPage({ publication: supersededPublication })
    await waitFor(() =>
      expect(
        screen.getByText(/این نسخه تاریخی و جایگزین‌شده است/),
      ).toBeTruthy(),
    )
    expect(
      screen.queryByRole('button', { name: 'بازگردانی این نسخه' }),
    ).toBeNull()
  })

  it('navigates to the new version and shows rollback source after success', async () => {
    mockGet.mockImplementation((publicationId) => {
      if (publicationId === 'publication-new') {
        return Promise.resolve(rolledBackPublication)
      }
      if (publicationId === 'publication-old') {
        return Promise.resolve({
          ...supersededPublication,
          schemaVersion: 1,
          sections: supersededPublication.sections,
        })
      }
      return Promise.resolve(supersededPublication)
    })
    renderPage({ publication: supersededPublication })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'بازگردانی این نسخه' }),
      ).toBeTruthy(),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'بازگردانی این نسخه' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی بازگردانی موفق' }),
    )

    await waitFor(() =>
      expect(
        screen.getByText('نسخه صفحه اصلی با موفقیت بازگردانی شد.'),
      ).toBeTruthy(),
    )
    await waitFor(() =>
      expect(screen.getByText(/نسخه جدید ۷ از نسخه ۳/)).toBeTruthy(),
    )
    await waitFor(() =>
      expect(screen.getAllByText(/بازگردانی از/).length).toBeGreaterThan(0),
    )
  })

  it('refreshes detail and explains a rollback conflict', async () => {
    mockGet.mockResolvedValue(supersededPublication)
    renderPage({ publication: supersededPublication })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'بازگردانی این نسخه' }),
      ).toBeTruthy(),
    )
    const callsBefore = mockGet.mock.calls.length
    fireEvent.click(
      screen.getByRole('button', { name: 'بازگردانی این نسخه' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی تعارض بازگردانی' }),
    )

    expect(screen.getByRole('alert').textContent).toContain(
      'وضعیت انتشار یا اعتبار snapshot مبدأ تغییر کرده است',
    )
    await waitFor(() =>
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore),
    )
  })

  it('refreshes stale detail state when a scheduled publication activates', async () => {
    mockGet
      .mockResolvedValueOnce(scheduledPublication)
      .mockResolvedValue({
        ...scheduledPublication,
        status: 'PUBLISHED',
        publishAt: null,
        publishedAt: '2026-11-10T12:00:00.000Z',
      })
    renderPage({ publication: scheduledPublication })

    await waitFor(() =>
      expect(screen.getByText('زمان زمان‌بندی')).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی از سرور' }))

    await waitFor(() =>
      expect(screen.getAllByText('منتشرشده').length).toBeGreaterThan(0),
    )
    expect(
      screen.queryByRole('button', { name: 'لغو انتشار زمان‌بندی‌شده' }),
    ).toBeNull()
  })

  it('clears publication A immediately and ignores its late response after navigating to B', async () => {
    let resolveA: ((value: HomepagePublicationDto) => void) | null = null
    mockGet.mockImplementation((publicationId) => {
      if (publicationId === 'publication-1') {
        return new Promise<HomepagePublicationDto>((resolve) => {
          resolveA = resolve
        })
      }
      if (publicationId === 'publication-2') {
        return Promise.resolve(publicationB)
      }
      return Promise.resolve(publicationB)
    })
    renderNavigable({ publication })

    expect(screen.getByText('ثبت‌شده برای بازبینی تیم')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'رفتن به B' }))

    await waitFor(() =>
      expect(screen.queryByText('ثبت‌شده برای بازبینی تیم')).toBeNull(),
    )
    await waitFor(() => expect(screen.getByText('نسخه ب')).toBeTruthy())

    await act(async () => {
      resolveA?.(publication)
      await Promise.resolve()
    })
    expect(screen.getByText('نسخه ب')).toBeTruthy()
    expect(screen.queryByText('ثبت‌شده برای بازبینی تیم')).toBeNull()
  })

  it('does not retain publication A when B fails to load', async () => {
    mockGet.mockImplementation((publicationId) => {
      if (publicationId === 'publication-2') {
        return Promise.reject(new Error('network'))
      }
      return Promise.resolve(publication)
    })
    renderNavigable({ publication })

    await waitFor(() =>
      expect(screen.getByText('ثبت‌شده برای بازبینی تیم')).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'رفتن به B' }))

    await waitFor(() =>
      expect(
        screen.getByText('خطایی رخ داد. دوباره تلاش کنید.'),
      ).toBeTruthy(),
    )
    expect(screen.queryByText('ثبت‌شده برای بازبینی تیم')).toBeNull()
  })

  it('passes the currently displayed publication to cancellation and rollback actions', async () => {
    mockGet.mockImplementation((publicationId) => {
      if (publicationId === 'publication-2') {
        return Promise.resolve(publicationBScheduled)
      }
      return Promise.resolve(scheduledPublication)
    })
    renderNavigable({ publication: scheduledPublication })

    fireEvent.click(screen.getByRole('button', { name: 'رفتن به B' }))
    await waitFor(() =>
      expect(screen.getByText('نسخه ب')).toBeTruthy(),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'لغو انتشار زمان‌بندی‌شده' }),
    )
    expect(screen.getByText('شناسه لغو: publication-2')).toBeTruthy()
  })

  it('passes the currently displayed publication to rollback after navigation', async () => {
    mockGet.mockImplementation((publicationId) => {
      if (publicationId === 'publication-2') {
        return Promise.resolve(publicationB)
      }
      return Promise.resolve(supersededPublication)
    })
    renderNavigable({ publication: supersededPublication })

    fireEvent.click(screen.getByRole('button', { name: 'رفتن به B' }))
    await waitFor(() => expect(screen.getByText('نسخه ب')).toBeTruthy())
    fireEvent.click(
      screen.getByRole('button', { name: 'بازگردانی این نسخه' }),
    )
    expect(screen.getByText('شناسه بازگردانی: publication-2')).toBeTruthy()
  })
})
