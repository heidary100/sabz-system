// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEntry, HomepagePublicationStatus } from '@sabz/types'
import { HomepagePublicationAuditPanel } from './homepage-publication-audit-panel'
import { formatTehranDateTime } from '../../../lib/tehran-time'

const auditHook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../../hooks/use-homepage-publication-audit', () => ({
  useHomepagePublicationAudit: () => auditHook.value,
}))

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    userId: 'user-1',
    actor: {
      id: 'user-1',
      firstName: 'سارا',
      lastName: 'احمدی',
      mobile: '09120000000',
    },
    action: 'HOMEPAGE_PUBLICATION_CANCELLED',
    entity: 'HomepagePublication',
    entityId: 'publication-2',
    before: { status: 'SCHEDULED' },
    after: { status: 'CANCELLED' },
    ipAddress: null,
    createdAt: '2026-11-10T10:00:00.000Z',
    ...overrides,
  }
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    entries: [entry()],
    total: 1,
    limit: 10,
    loading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

describe('HomepagePublicationAuditPanel (SS-280/SS-281)', () => {
  beforeEach(() => {
    auditHook.value = state()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderPanel(
    publication: {
      status: HomepagePublicationStatus
      rollbackFromPublicationId: string | null
    } = { status: 'CANCELLED', rollbackFromPublicationId: null },
  ) {
    return render(
      <HomepagePublicationAuditPanel
        publicationId="publication-2"
        publication={publication}
      />,
    )
  }

  it('renders action labels and operator attribution', () => {
    renderPanel()
    expect(
      screen.getAllByText('لغو انتشار زمان‌بندی‌شده صفحه اصلی').length,
    ).toBeGreaterThan(0)
    expect(screen.getByText('سارا احمدی')).toBeTruthy()
    expect(screen.getAllByText('لغو توسط اپراتور').length).toBeGreaterThan(0)
  })

  it('preserves opaque system actor identifiers and system-blocked diagnosis', () => {
    auditHook.value = state({
      entries: [
        entry({
          userId: 'system:homepage-activation',
          actor: null,
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
          after: {
            status: 'CANCELLED',
            code: 'DEPENDENCIES_INVALID',
            dependencyCodes: ['MEDIA_MISSING'],
          },
        }),
      ],
    })
    renderPanel()
    expect(screen.getAllByText(/system:homepage-activation/).length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('مسدود شدن فعال‌سازی انتشار صفحه اصلی').length,
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('لغو توسط سیستم').length).toBeGreaterThan(0)
    expect(screen.getByText(/رسانه ارجاع‌شده/)).toBeTruthy()
  })

  it('shows a neutral unavailable message and does not invent a cancellation reason', () => {
    auditHook.value = state({ error: new Error('network'), entries: [] })
    renderPanel()
    expect(
      screen.getByText(/اطلاعات گردش فعالیت در دسترس نیست/),
    ).toBeTruthy()
    expect(
      screen.getByText(/دلیل لغو یا مسدود شدن را از وضعیت انتشار حدس نمی‌زنیم/),
    ).toBeTruthy()
  })

  it('shows an empty state and an unknown-cancellation diagnosis', () => {
    auditHook.value = state({ entries: [], total: 0 })
    renderPanel()
    expect(screen.getByText('رویدادی ثبت نشده است')).toBeTruthy()
    expect(screen.getByText('لغوشده — دلیل نامشخص')).toBeTruthy()
  })

  it('shows transient activation failure as retryable for a SCHEDULED publication', () => {
    auditHook.value = state({
      entries: [
        entry({
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
          after: { status: 'SCHEDULED', errorCode: 'P1001' },
        }),
      ],
    })
    renderPanel({
      status: 'SCHEDULED',
      rollbackFromPublicationId: null,
    })
    expect(screen.getAllByText('تلاش ناموفق موقت').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/نسخه همچنان «زمان‌بندی‌شده» باقی مانده است/),
    ).toBeTruthy()
    expect(screen.getAllByText(/P1001/).length).toBeGreaterThan(0)
  })

  it('opens audit details from the recorded entry with sensitive text redacted', () => {
    auditHook.value = state({
      entries: [
        entry({
          action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
          after: {
            errorCode: 'P1001',
            message: 'internal database detail',
            stack: 'secret stack',
          },
        }),
      ],
    })
    renderPanel({
      status: 'SCHEDULED',
      rollbackFromPublicationId: null,
    })
    fireEvent.click(screen.getByRole('button', { name: 'مشاهده' }))
    expect(
      screen.getByRole('heading', {
        name: /تلاش ناموفق فعال‌سازی انتشار صفحه اصلی/,
      }),
    ).toBeTruthy()
    expect(
      screen.getAllByText(formatTehranDateTime(entry().createdAt)).length,
    ).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('internal database detail')).toBeNull()
    expect(screen.queryByText('secret stack')).toBeNull()
    expect(screen.getAllByText('P1001').length).toBeGreaterThan(0)
  })
})
