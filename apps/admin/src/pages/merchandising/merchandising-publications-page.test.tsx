// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import { MemoryRouter } from 'react-router-dom'
import { MerchandisingPublicationsPage } from './merchandising-publications-page'
import { listAudit } from '../../services/audit'

const auth = vi.hoisted(() => ({ roles: ['ADMIN'] as string[] }))
const list = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../services/audit', () => ({
  listAudit: vi.fn(),
}))

const mockListAudit = vi.mocked(listAudit)

vi.mock('../../auth/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'user-1', roles: auth.roles },
    isAdmin: true,
  }),
}))

vi.mock('../../hooks/use-homepage-publication-list', () => ({
  useHomepagePublicationList: () => list.value,
}))

const cancelled: HomepagePublicationDto = {
  id: 'publication-2',
  version: 5,
  status: 'CANCELLED',
  publishAt: '2030-01-01T08:30:00.000Z',
  publishedAt: null,
  sourceDraftRevision: 4,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  schemaVersion: 1,
  sections: [],
}

const rolledBack = vi.hoisted(() => ({
  id: 'publication-6',
  version: 6,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T12:00:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: 'publication-0',
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T12:00:00.000Z',
  schemaVersion: 1,
  sections: [],
}))

const rollbackSourceResult = vi.hoisted(() => ({
  id: 'publication-0',
  version: 3,
  status: 'SUPERSEDED',
  publishAt: null,
  publishedAt: '2026-10-10T10:05:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-10-10T10:05:00.000Z',
}))

vi.mock(
  '../../components/merchandising/homepage/homepage-publication-cancel-dialog',
  () => ({
    HomepagePublicationCancelDialog: ({
      open,
      onCancelled,
      onConflict,
    }: {
      open: boolean
      onCancelled: (publication: HomepagePublicationDto) => void
      onConflict: () => void
    }) =>
      open ? (
        <div>
          <button type="button" onClick={() => onCancelled(cancelled)}>
            شبیه‌سازی لغو موفق
          </button>
          <button type="button" onClick={onConflict}>
            شبیه‌سازی تعارض لغو
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
      onRolledBack,
      onConflict,
    }: {
      open: boolean
      onRolledBack: (
        publication: typeof rolledBack,
        source: typeof rollbackSourceResult,
      ) => void
      onConflict: () => void
    }) =>
      open ? (
        <div>
          <button
            type="button"
            onClick={() => onRolledBack(rolledBack, rollbackSourceResult)}
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

function summary(
  overrides: Partial<HomepagePublicationSummaryDto> = {},
): HomepagePublicationSummaryDto {
  return {
    id: 'publication-1',
    version: 4,
    status: 'PUBLISHED',
    publishAt: null,
    publishedAt: '2026-11-10T10:05:00.000Z',
    sourceDraftRevision: 3,
    rollbackFromPublicationId: null,
    note: 'یادداشت',
    createdBy: 'user-1',
    publishedBy: 'user-1',
    createdAt: '2026-11-10T10:05:00.000Z',
    ...overrides,
  }
}

const scheduled = summary({
  id: 'publication-2',
  version: 5,
  status: 'SCHEDULED',
  publishedAt: null,
  publishAt: '2030-01-01T08:30:00.000Z',
  note: 'زمان‌بندی زمستانه',
  publishedBy: null,
})
const published = summary()
const superseded = summary({
  id: 'publication-0',
  version: 3,
  status: 'SUPERSEDED',
})

const cancelledSummary = summary({
  id: 'publication-cancelled',
  version: 2,
  status: 'CANCELLED',
  publishedAt: null,
  publishAt: '2026-12-01T08:30:00.000Z',
  publishedBy: null,
})

function listState(overrides: Record<string, unknown> = {}) {
  return {
    status: '',
    page: 1,
    limit: 20,
    result: {
      items: [published, scheduled, superseded, cancelledSummary],
      total: 4,
      page: 1,
      limit: 20,
    },
    loading: false,
    error: null,
    setStatus: vi.fn(),
    setPage: vi.fn(),
    setLimit: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/merchandising/publications']}>
      <MerchandisingPublicationsPage />
    </MemoryRouter>,
  )
}

describe('merchandising publication history (SS-280)', () => {
  beforeEach(() => {
    auth.roles = ['ADMIN']
    list.value = listState()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders statuses, current publication, Tehran times, and server pagination', () => {
    renderPage()

    expect(screen.getByText('نسخه ۴')).toBeTruthy()
    expect(screen.getByText('نسخه ۵')).toBeTruthy()
    expect(screen.getByText('نسخه ۳')).toBeTruthy()
    expect(screen.getByText('نسخه جاری')).toBeTruthy()
    expect(screen.getAllByText(/زمان‌بندی: .*به وقت تهران/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/انتشار: .*به وقت تهران/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('نسخه').length).toBeGreaterThan(0)
  })

  it('does not fetch audit records for history rows', () => {
    renderPage()
    expect(mockListAudit).not.toHaveBeenCalled()
  })

  it('applies status filtering through the server query state', () => {
    const setStatus = vi.fn()
    list.value = listState({ setStatus })
    renderPage()

    fireEvent.change(screen.getByLabelText('وضعیت انتشار'), {
      target: { value: 'SCHEDULED' },
    })
    expect(setStatus).toHaveBeenCalledWith('SCHEDULED')
  })

  it('uses server pagination and opens detail links', () => {
    const setPage = vi.fn()
    const setLimit = vi.fn()
    list.value = listState({
      setPage,
      setLimit,
      result: {
        items: [published, scheduled, superseded],
        total: 45,
        page: 1,
        limit: 20,
      },
    })
    renderPage()

    expect(
      screen.getByText('نسخه ۴').closest('a')?.getAttribute('href'),
    ).toBe('/merchandising/publications/publication-1')

    fireEvent.click(
      screen.getAllByRole('button', { name: 'صفحه بعد' })[0]!,
    )
    expect(setPage).toHaveBeenCalledWith(2)

    fireEvent.change(
      screen.getAllByLabelText(/تعداد در هر صفحه/)[0]!,
      { target: { value: '50' } },
    )
    expect(setLimit).toHaveBeenCalledWith(50)
  })

  it('offers cancellation for scheduled rows to ADMIN only', () => {
    renderPage()
    expect(
      screen.getAllByRole('button', { name: 'لغو' }).length,
    ).toBe(1)

    cleanup()
    auth.roles = ['OPERATOR']
    renderPage()
    expect(screen.queryByRole('button', { name: 'لغو' })).toBeNull()
  })

  it('offers rollback only for SUPERSEDED rows to ADMIN', () => {
    renderPage()
    expect(
      screen.getAllByRole('button', { name: 'بازگردانی' }).length,
    ).toBe(1)

    cleanup()
    auth.roles = ['OPERATOR']
    renderPage()
    expect(screen.queryByRole('button', { name: 'بازگردانی' })).toBeNull()
  })

  it('refreshes history and reports new version/source after rollback success', () => {
    const refetch = vi.fn()
    list.value = listState({ refetch })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'بازگردانی' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی بازگردانی موفق' }),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText(/نسخه ۶ از نسخه ۳ بازگردانی شد/),
    ).toBeTruthy()
  })

  it('refreshes history and explains a rollback conflict', () => {
    const refetch = vi.fn()
    list.value = listState({ refetch })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'بازگردانی' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی تعارض بازگردانی' }),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain(
      'وضعیت انتشار تغییر کرده یا نسخه مبدأ دیگر معتبر نیست',
    )
    expect(
      screen.getByRole('button', { name: 'شبیه‌سازی بازگردانی موفق' }),
    ).toBeTruthy()
  })

  it('refreshes the list after a successful cancellation and after a conflict', () => {
    const refetch = vi.fn()
    list.value = listState({ refetch })
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'لغو' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی لغو موفق' }),
    )
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(
      screen.getByText(/انتشار زمان‌بندی‌شده نسخه ۵ لغو شد/),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'لغو' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'شبیه‌سازی تعارض لغو' }),
    )
    expect(refetch).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('alert').textContent).toContain(
      'وضعیت این انتشار تغییر کرده است',
    )
    expect(
      screen.getByRole('button', { name: 'شبیه‌سازی لغو موفق' }),
    ).toBeTruthy()
  })

  it('provides an explicit refresh control without resetting filters', () => {
    const refetch = vi.fn()
    list.value = listState({ refetch })
    renderPage()

    fireEvent.click(
      screen.getByRole('button', { name: 'به‌روزرسانی فهرست' }),
    )
    expect(refetch).toHaveBeenCalledTimes(1)

    cleanup()
    list.value = listState({ refetch, loading: true })
    renderPage()
    expect(
      (
        screen.getByRole('button', {
          name: 'در حال به‌روزرسانی…',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('directs scheduled and cancelled rows to diagnostics without audit fan-out', () => {
    renderPage()
    expect(
      screen.getAllByRole('link', { name: 'مشاهده و تشخیص' }).length,
    ).toBe(2)
    expect(mockListAudit).not.toHaveBeenCalled()
  })

  it('shows empty, loading, and error states', () => {
    list.value = listState({
      result: null,
      loading: true,
    })
    const { rerender } = renderPage()
    expect(screen.getByText('در حال بارگذاری تاریخچه انتشار…')).toBeTruthy()

    list.value = listState({
      result: { items: [], total: 0, page: 1, limit: 20 },
      loading: false,
    })
    rerender(
      <MemoryRouter>
        <MerchandisingPublicationsPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByText('هنوز نسخه‌ای منتشر یا زمان‌بندی نشده است'),
    ).toBeTruthy()

    list.value = listState({ result: null, loading: false, error: new Error('x') })
    rerender(
      <MemoryRouter>
        <MerchandisingPublicationsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('خطایی رخ داد. دوباره تلاش کنید.')).toBeTruthy()
  })
})
