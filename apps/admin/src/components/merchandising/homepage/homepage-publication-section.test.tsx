// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepageDraftSection,
  HomepageDraftValidationResult,
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import { HomepagePublicationSection } from './homepage-publication-section'

const publicationHook = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}))

vi.mock('../../../hooks/use-homepage-publication', () => ({
  useHomepagePublication: () => publicationHook.value,
}))

const publication: HomepagePublicationDto = {
  id: 'publication-1',
  version: 4,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T10:05:00.000Z',
  sourceDraftRevision: 3,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T10:05:00.000Z',
  schemaVersion: 1,
  sections: [],
}

const currentPublication: HomepagePublicationSummaryDto = {
  id: 'publication-0',
  version: 3,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-09T10:00:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: null,
  note: 'نسخه قبلی',
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-09T10:00:00.000Z',
}

const scheduledPublication: HomepagePublicationDto = {
  ...publication,
  id: 'publication-2',
  version: 5,
  status: 'SCHEDULED',
  publishAt: '2030-01-01T08:30:00.000Z',
  publishedAt: null,
}

const sections: HomepageDraftSection[] = [
  {
    key: 'trust-main',
    type: 'TRUST_STRIP',
    order: 0,
    isVisible: true,
    settings: { items: [] },
  },
]

function validation(
  overrides: Partial<HomepageDraftValidationResult> = {},
): HomepageDraftValidationResult {
  return {
    revision: 3,
    schemaVersion: 1,
    valid: true,
    errors: [],
    warnings: [],
    ...overrides,
  }
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    current: currentPublication,
    currentLoading: false,
    currentError: null,
    publishing: false,
    refreshCurrent: vi.fn(),
    publish: vi.fn(),
    schedule: vi.fn(),
    ...overrides,
  }
}

const baseProps = {
  revision: 3,
  schemaVersion: 1,
  sections,
  loading: false,
  dirty: false,
  saving: false,
  conflict: null,
  validating: false,
  validation: validation(),
  validationTarget: 'server' as const,
  validationOutdated: false,
  canPublish: true,
  onSave: vi.fn(),
  onValidate: vi.fn(),
  onSchedule: vi.fn(),
  onValidationFromPublication: vi.fn(),
  onPublished: vi.fn(),
  onSelectSection: vi.fn(),
  onReloadDraft: vi.fn(),
}

function renderSection(overrides: Record<string, unknown> = {}) {
  return render(
    <HomepagePublicationSection {...baseProps} {...overrides} />,
  )
}

describe('HomepagePublicationSection (SS-279)', () => {
  beforeEach(() => {
    publicationHook.value = hookState()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows the current publication and enables ADMIN publishing for a current server validation', () => {
    renderSection()
    expect(screen.getByText('آماده انتشار')).toBeTruthy()
    expect(screen.getByText(/نسخه پیش‌نویس فعلی ۳/)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeTruthy()
    expect(
      screen.queryByText(/انتشار فوری و زمان‌بندی فقط برای نقش مدیر/),
    ).toBeNull()
  })

  it('hides publishing from OPERATOR while keeping readiness visible', () => {
    renderSection({ canPublish: false })
    expect(screen.getByText('آماده انتشار')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()
    expect(
      screen.getByText(/انتشار فوری و زمان‌بندی فقط برای نقش مدیر/),
    ).toBeTruthy()
  })

  it('does not offer publishing for a dirty draft', () => {
    renderSection({ dirty: true })
    expect(screen.getByText('تغییرات ذخیره‌نشده')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'ذخیره تغییرات' }),
    ).toBeTruthy()
  })

  it('does not offer publishing for local or outdated validation', () => {
    const { rerender } = renderSection({ validationTarget: 'local' })
    expect(screen.getByText('اعتبارسنجی تغییرات محلی')).toBeTruthy()
    expect(
      screen.getByText(/برای انتشار نسخه ذخیره‌شده معتبر نیست/),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()

    rerender(
      <HomepagePublicationSection
        {...baseProps}
        validationOutdated
      />,
    )
    expect(screen.getByText('اعتبارسنجی قدیمی')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()
  })

  it('blocks publishing when validation has errors', () => {
    renderSection({
      validation: validation({
        valid: false,
        errors: [
          {
            path: 'sections[0].settings.items',
            code: 'EMPTY',
            message: 'نوار اعتماد خالی است.',
            severity: 'ERROR',
            category: 'STRUCTURAL',
          },
        ],
      }),
    })
    expect(screen.getByText('نیازمند اصلاح')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()
  })

  it('requires warning acknowledgement before confirming publication', async () => {
    const publish = vi.fn().mockResolvedValue({
      status: 'success',
      publication,
      expectedRevision: 3,
      revisionMismatch: false,
    })
    publicationHook.value = hookState({ publish })
    renderSection({
      validation: validation({
        warnings: [
          {
            path: 'sections[0].settings.items',
            code: 'SOFT_WARNING',
            message: 'این بخش فقط یک آیتم دارد.',
            severity: 'WARNING',
            category: 'WARNING',
          },
        ],
      }),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    )
    expect(
      screen.getByRole('heading', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeTruthy()
    expect(
      screen.getAllByText('این بخش فقط یک آیتم دارد.').length,
    ).toBeGreaterThan(0)
    const confirm = screen.getByRole('button', { name: 'انتشار فوری' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(
      screen.getByLabelText(
        'هشدارهای بالا را بررسی کردم و با انتشار ادامه می‌دهم.',
      ),
    )
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith({ note: null, expectedRevision: 3 }),
    )
    await waitFor(() =>
      expect(baseProps.onPublished).toHaveBeenCalledWith(publication, {
        expectedRevision: 3,
        revisionMismatch: false,
      }),
    )
  })

  it('cancelling the confirmation sends no publication request', () => {
    const publish = vi.fn()
    publicationHook.value = hookState({ publish })
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(publish).not.toHaveBeenCalled()
  })

  it('maps publication-time validation errors into the shared validation store', async () => {
    const onValidationFromPublication = vi.fn()
    const publish = vi.fn().mockResolvedValue({
      status: 'invalid',
      message: 'اعتبارسنجی سرور در زمان انتشار خطا یافت.',
      errors: [
        {
          path: 'sections[0].settings.items',
          code: 'EMPTY',
          message: 'نوار اعتماد خالی است.',
          severity: 'ERROR',
          category: 'STRUCTURAL',
        },
      ],
      warnings: [],
    })
    publicationHook.value = hookState({ publish })
    renderSection({ onValidationFromPublication })

    fireEvent.click(
      screen.getByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'انتشار فوری' }))

    await waitFor(() =>
      expect(onValidationFromPublication).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 3,
          schemaVersion: 1,
          valid: false,
          errors: [
            expect.objectContaining({
              path: 'sections[0].settings.items',
              code: 'EMPTY',
            }),
          ],
        }),
      ),
    )
    expect(
      screen.getByText('اعتبارسنجی سرور در زمان انتشار خطا یافت.'),
    ).toBeTruthy()
    expect(baseProps.onPublished).not.toHaveBeenCalled()
  })

  it.each([
    ['forbidden', 'دسترسی انتشار ندارید.'],
    ['conflict', 'نسخه ذخیره‌شده روی سرور تغییر کرده است.'],
    ['ambiguous', 'پاسخ سرور دریافت نشد.'],
    ['error', 'خطای سرور.'],
  ])('shows the %s error without claiming success', async (status, message) => {
    const publish = vi.fn().mockResolvedValue({
      status,
      message,
      currentRevision: 4,
    } as never)
    publicationHook.value = hookState({ publish })
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'انتشار فوری' }))

    await waitFor(() => expect(screen.getByText(message)).toBeTruthy())
    expect(baseProps.onPublished).not.toHaveBeenCalled()
  })

  it('offers an explicit server reload after a publication conflict', async () => {
    const publish = vi.fn().mockResolvedValue({
      status: 'conflict',
      message: 'نسخه سرور متفاوت است.',
      currentRevision: 6,
    })
    publicationHook.value = hookState({ publish })
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'انتشار فوری' }))

    await waitFor(() => expect(screen.getByText('نسخه سرور متفاوت است.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی پیش‌نویس از سرور' }))
    expect(baseProps.onReloadDraft).toHaveBeenCalledOnce()
  })

  it('shows the publication-in-progress state and hides publishing actions', () => {
    publicationHook.value = hookState({ publishing: true })
    renderSection()
    expect(screen.getByText('در حال انتشار')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()
  })

  it('shows validating and saving states without a publish action', () => {
    const { rerender } = renderSection({ validating: true })
    expect(screen.getByText('در حال اعتبارسنجی')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()

    rerender(<HomepagePublicationSection {...baseProps} saving />)
    expect(screen.getByText('در حال ذخیره پیش‌نویس')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()

    rerender(<HomepagePublicationSection {...baseProps} loading />)
    expect(screen.getByText('در حال بازخوانی پیش‌نویس')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'انتشار فوری صفحه اصلی' }),
    ).toBeNull()
  })

  it('keeps unmapped warning paths visible', () => {
    renderSection({
      validation: validation({
        warnings: [
          {
            path: 'unmapped.path',
            code: 'UNMAPPED',
            message: 'هشدار بدون بخش مشخص',
            severity: 'WARNING',
            category: 'WARNING',
          },
        ],
      }),
    })
    expect(screen.getByText('هشدار بدون بخش مشخص')).toBeTruthy()
    expect(screen.getByText('unmapped.path')).toBeTruthy()
  })

  it('offers scheduling only to ADMIN', () => {
    const { rerender } = renderSection()
    expect(
      screen.getByRole('button', { name: 'زمان‌بندی انتشار' }),
    ).toBeTruthy()

    rerender(
      <HomepagePublicationSection {...baseProps} canPublish={false} />,
    )
    expect(
      screen.queryByRole('button', { name: 'زمان‌بندی انتشار' }),
    ).toBeNull()
  })

  it('schedules with a Tehran wall time converted to UTC and a note', async () => {
    const schedule = vi.fn().mockResolvedValue({
      status: 'success',
      publication: scheduledPublication,
      expectedRevision: 3,
      revisionMismatch: false,
    })
    publicationHook.value = hookState({ schedule })
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'زمان‌بندی انتشار' }),
    )
    expect(
      screen.getByRole('heading', { name: 'زمان‌بندی انتشار صفحه اصلی' }),
    ).toBeTruthy()
    fireEvent.change(
      screen.getByLabelText('زمان انتشار (به وقت تهران)'),
      { target: { value: '2030-01-01T12:00' } },
    )
    fireEvent.change(screen.getByLabelText('یادداشت (اختیاری)'), {
      target: { value: '  انتشار زمستانه  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت زمان‌بندی' }))

    await waitFor(() =>
      expect(schedule).toHaveBeenCalledWith({
        publishAt: '2030-01-01T08:30:00.000Z',
        note: 'انتشار زمستانه',
        expectedRevision: 3,
      }),
    )
    await waitFor(() =>
      expect(baseProps.onPublished).toHaveBeenCalledWith(
        scheduledPublication,
        { expectedRevision: 3, revisionMismatch: false },
      ),
    )
  })

  it('requires warning acknowledgement for scheduling and blocks past/invalid times', () => {
    const schedule = vi.fn()
    publicationHook.value = hookState({ schedule })
    renderSection({
      validation: validation({
        warnings: [
          {
            path: 'sections[0].settings.items',
            code: 'SOFT_WARNING',
            message: 'این بخش فقط یک آیتم دارد.',
            severity: 'WARNING',
            category: 'WARNING',
          },
        ],
      }),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'زمان‌بندی انتشار' }),
    )
    const confirm = screen.getByRole('button', { name: 'ثبت زمان‌بندی' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(
      screen.getByLabelText(
        'هشدارهای بالا را بررسی کردم و با زمان‌بندی ادامه می‌دهم.',
      ),
    )
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(
      screen.getByLabelText('زمان انتشار (به وقت تهران)'),
      { target: { value: '2020-01-01T12:00' } },
    )
    expect((confirm as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(confirm)
    expect(screen.getByText('زمان انتشار باید در آینده باشد.')).toBeTruthy()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('does not schedule when the schedule dialog is cancelled', () => {
    const schedule = vi.fn()
    publicationHook.value = hookState({ schedule })
    renderSection()

    fireEvent.click(
      screen.getByRole('button', { name: 'زمان‌بندی انتشار' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(schedule).not.toHaveBeenCalled()
  })
})
