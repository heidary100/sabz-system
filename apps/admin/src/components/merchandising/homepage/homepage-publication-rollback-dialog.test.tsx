// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import { HomepagePublicationRollbackDialog } from './homepage-publication-rollback-dialog'

const rollbackHook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../../hooks/use-homepage-publication-rollback', () => ({
  useHomepagePublicationRollback: () => rollbackHook.value,
}))

const source: HomepagePublicationSummaryDto = {
  id: 'publication-old',
  version: 3,
  status: 'SUPERSEDED',
  publishAt: null,
  publishedAt: '2026-10-01T08:30:00.000Z',
  sourceDraftRevision: 2,
  rollbackFromPublicationId: null,
  note: 'نسخه تاریخی',
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-10-01T08:30:00.000Z',
}

const created: HomepagePublicationDto = {
  id: 'publication-new',
  version: 7,
  status: 'PUBLISHED',
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
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    rollingBack: false,
    rollback: vi.fn().mockResolvedValue({
      status: 'success',
      publication: created,
    }),
    ...overrides,
  }
}

function renderDialog(overrides: Record<string, unknown> = {}) {
  return render(
    <HomepagePublicationRollbackDialog
      open
      publication={source}
      onClose={overrides.onClose as (() => void) ?? vi.fn()}
      onRolledBack={
        (overrides.onRolledBack as
          | ((p: HomepagePublicationDto, s: HomepagePublicationSummaryDto) => void)
          | undefined) ?? vi.fn()
      }
      onConflict={
        (overrides.onConflict as (() => void) | undefined) ?? vi.fn()
      }
    />,
  )
}

describe('HomepagePublicationRollbackDialog (SS-281)', () => {
  beforeEach(() => {
    rollbackHook.value = hookState()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('identifies the source and explains new-version semantics', () => {
    renderDialog()
    expect(screen.getAllByText(/نسخه ۳/).length).toBeGreaterThan(0)
    expect(screen.getByText(/زمان انتشار اصلی: .*به وقت تهران/)).toBeTruthy()
    expect(screen.getByText(/پیش‌نویس منبع/)).toBeTruthy()
    expect(
      screen.getByText(/یک نسخه جدید با محتوای همین snapshot تاریخی/),
    ).toBeTruthy()
    expect(screen.getByText(/پیش‌نویس صفحه اصلی تغییر نمی‌کند/)).toBeTruthy()
    expect(screen.getByText(/snapshot تاریخی بازنویسی/)).toBeTruthy()
  })

  it('submits the optional note and reports the actual returned publication', async () => {
    const onRolledBack = vi.fn()
    const onClose = vi.fn()
    const rollback = vi.fn().mockResolvedValue({
      status: 'success',
      publication: created,
    })
    rollbackHook.value = hookState({ rollback })
    renderDialog({ onRolledBack, onClose })

    fireEvent.change(screen.getByLabelText('یادداشت (اختیاری)'), {
      target: { value: '  بازگردانی آزمایشی  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'بازگردانی نسخه' }))

    await waitFor(() =>
      expect(rollback).toHaveBeenCalledWith(
        'publication-old',
        '  بازگردانی آزمایشی  ',
      ),
    )
    await waitFor(() =>
      expect(onRolledBack).toHaveBeenCalledWith(created, source),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not offer rollback for an ineligible publication', () => {
    render(
      <HomepagePublicationRollbackDialog
        open
        publication={{ ...source, status: 'PUBLISHED' }}
        onClose={vi.fn()}
        onRolledBack={vi.fn()}
        onConflict={vi.fn()}
      />,
    )
    expect(
      (
        screen.getByRole('button', {
          name: 'بازگردانی نسخه',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      screen.getByText(/فقط نسخه‌های تاریخی «جایگزین‌شده»/),
    ).toBeTruthy()
  })

  it('shows 409 dependency errors, refreshes, and does not claim success', async () => {
    const onRolledBack = vi.fn()
    const onConflict = vi.fn()
    const rollback = vi.fn().mockResolvedValue({
      status: 'conflict',
      message: 'محتوای این نسخه با وضعیت فعلی سازگار نیست.',
      errorCode: 'HOMEPAGE_ROLLBACK_INVALID',
      currentStatus: 'PUBLISHED',
      currentPublicationId: 'publication-current',
      errors: [
        {
          path: 'sections[0].settings.items',
          code: 'MEDIA_MISSING',
          message: 'رسانه این بخش در دسترس نیست.',
          severity: 'ERROR',
          category: 'MISSING_REFERENCE',
        },
      ],
      warnings: [],
    })
    rollbackHook.value = hookState({ rollback })
    renderDialog({ onRolledBack, onConflict })

    fireEvent.click(screen.getByRole('button', { name: 'بازگردانی نسخه' }))

    await waitFor(() =>
      expect(
        screen.getByText('رسانه این بخش در دسترس نیست.'),
      ).toBeTruthy(),
    )
    expect(
      screen.getByText(/محتوای این نسخه با وضعیت فعلی سازگار نیست/),
    ).toBeTruthy()
    expect(screen.getByText(/وضعیت فعلی سرور: منتشرشده/)).toBeTruthy()
    expect(onConflict).toHaveBeenCalledOnce()
    expect(onRolledBack).not.toHaveBeenCalled()
    expect(
      (
        screen.getByRole('button', {
          name: 'بازگردانی نسخه',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('shows ambiguous failures without retrying or refreshing falsely', async () => {
    const onConflict = vi.fn()
    const rollback = vi.fn().mockResolvedValue({
      status: 'ambiguous',
      message: 'پاسخ سرور دریافت نشد؛ ممکن است بازگردانی انجام شده باشد.',
    })
    rollbackHook.value = hookState({ rollback })
    renderDialog({ onConflict })

    fireEvent.click(screen.getByRole('button', { name: 'بازگردانی نسخه' }))
    await waitFor(() =>
      expect(
        screen.getByText(/ممکن است بازگردانی انجام شده باشد/),
      ).toBeTruthy(),
    )
    expect(rollback).toHaveBeenCalledTimes(1)
    expect(onConflict).not.toHaveBeenCalled()
    expect(
      (
        screen.getByRole('button', {
          name: 'بازگردانی نسخه',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('sends no mutation when dismissed', () => {
    const rollback = vi.fn()
    const onClose = vi.fn()
    rollbackHook.value = hookState({ rollback })
    renderDialog({ onClose })

    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(rollback).not.toHaveBeenCalled()
  })
})
