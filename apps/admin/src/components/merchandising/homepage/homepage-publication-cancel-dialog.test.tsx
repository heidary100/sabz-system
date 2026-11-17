// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
} from '@sabz/types'
import { HomepagePublicationCancelDialog } from './homepage-publication-cancel-dialog'

const cancelHook = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))

vi.mock('../../../hooks/use-homepage-publication-cancel', () => ({
  useHomepagePublicationCancel: () => cancelHook.value,
}))

const scheduled: HomepagePublicationSummaryDto = {
  id: 'publication-2',
  version: 5,
  status: 'SCHEDULED',
  publishAt: '2030-01-01T08:30:00.000Z',
  publishedAt: null,
  sourceDraftRevision: 4,
  rollbackFromPublicationId: null,
  note: 'زمان‌بندی زمستانه',
  createdBy: 'user-1',
  publishedBy: null,
  createdAt: '2026-11-10T10:00:00.000Z',
}

const cancelled: HomepagePublicationDto = {
  ...scheduled,
  status: 'CANCELLED',
  schemaVersion: 1,
  sections: [],
}

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    cancelling: false,
    cancel: vi.fn().mockResolvedValue({
      status: 'success',
      publication: cancelled,
    }),
    ...overrides,
  }
}

function renderDialog(
  overrides: Record<string, unknown> = {},
  publication: HomepagePublicationSummaryDto | null = scheduled,
) {
  return render(
    <HomepagePublicationCancelDialog
      open
      publication={publication}
      onClose={overrides.onClose as (() => void) | undefined ?? vi.fn()}
      onCancelled={
        (overrides.onCancelled as ((p: HomepagePublicationDto) => void) | undefined) ??
        vi.fn()
      }
      onConflict={
        (overrides.onConflict as (() => void) | undefined) ?? vi.fn()
      }
    />,
  )
}

describe('HomepagePublicationCancelDialog (SS-280)', () => {
  beforeEach(() => {
    cancelHook.value = hookState()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('identifies the scheduled publication and explains the effect', () => {
    renderDialog()
    expect(screen.getAllByText(/نسخه ۵/).length).toBeGreaterThan(0)
    expect(screen.getByText(/به وقت تهران/)).toBeTruthy()
    expect(
      screen.getByText(/محتوای عمومی فعلی فروشگاه تغییر نمی‌کند/),
    ).toBeTruthy()
    expect(screen.getByText(/فقط تا پیش از فعال‌سازی/)).toBeTruthy()
  })

  it('submits once, reports success, and does not optimistically close before the server', async () => {
    const onCancelled = vi.fn()
    const onClose = vi.fn()
    const cancel = vi.fn().mockResolvedValue({
      status: 'success',
      publication: cancelled,
    })
    cancelHook.value = hookState({ cancel })
    renderDialog({ onCancelled, onClose })

    fireEvent.click(screen.getByRole('button', { name: 'لغو انتشار' }))
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('publication-2'))
    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith(cancelled))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('handles conflict by asking the parent to refresh', async () => {
    const onConflict = vi.fn()
    const cancel = vi.fn().mockResolvedValue({
      status: 'conflict',
      message: 'وضعیت انتشار تغییر کرده است.',
      currentStatus: 'PUBLISHED',
    })
    cancelHook.value = hookState({ cancel })
    renderDialog({ onConflict })

    fireEvent.click(screen.getByRole('button', { name: 'لغو انتشار' }))
    await waitFor(() =>
      expect(screen.getByText('وضعیت انتشار تغییر کرده است.')).toBeTruthy(),
    )
    expect(onConflict).toHaveBeenCalledOnce()
    expect(screen.getByText('وضعیت فعلی سرور: منتشرشده')).toBeTruthy()
    expect(
      (
        screen.getByRole('button', {
          name: 'لغو انتشار',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('shows ambiguous failures without retrying or refreshing falsely', async () => {
    const onConflict = vi.fn()
    const cancel = vi.fn().mockResolvedValue({
      status: 'ambiguous',
      message: 'پاسخ سرور دریافت نشد؛ ممکن است لغو انجام شده باشد.',
    })
    cancelHook.value = hookState({ cancel })
    renderDialog({ onConflict })

    fireEvent.click(screen.getByRole('button', { name: 'لغو انتشار' }))
    await waitFor(() =>
      expect(
        screen.getByText(/ممکن است لغو انجام شده باشد/),
      ).toBeTruthy(),
    )
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(onConflict).not.toHaveBeenCalled()
    expect(
      (
        screen.getByRole('button', {
          name: 'لغو انتشار',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('does not offer cancellation for a non-scheduled publication', () => {
    renderDialog({}, { ...scheduled, status: 'PUBLISHED' })
    expect(
      (
        screen.getByRole('button', {
          name: 'لغو انتشار',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      screen.getByText(/در وضعیت زمان‌بندی‌شده نیست/),
    ).toBeTruthy()
  })

  it('sends no mutation when dismissed', () => {
    const cancel = vi.fn()
    const onClose = vi.fn()
    cancelHook.value = hookState({ cancel })
    renderDialog({ onClose })

    fireEvent.click(screen.getByRole('button', { name: 'بستن' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(cancel).not.toHaveBeenCalled()
  })
})
