// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomepagePublicationDto } from '@sabz/types'
import { useHomepagePublicationRollback } from './use-homepage-publication-rollback'
import { rollbackHomepagePublication } from '../services/merchandising'
import { ApiError } from '../services/api'

vi.mock('../services/merchandising', () => ({
  rollbackHomepagePublication: vi.fn(),
}))

const mockRollback = vi.mocked(rollbackHomepagePublication)

const rolledBack: HomepagePublicationDto = {
  id: 'publication-new',
  version: 7,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T12:00:00.000Z',
  sourceDraftRevision: 3,
  rollbackFromPublicationId: 'publication-old',
  note: 'بازگردانی از نسخه ۳',
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T12:00:00.000Z',
  schemaVersion: 1,
  sections: [],
}

describe('useHomepagePublicationRollback (SS-281)', () => {
  beforeEach(() => {
    mockRollback.mockReset()
    mockRollback.mockResolvedValue(rolledBack)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends only the supported note payload and returns the new publication', async () => {
    const { result } = renderHook(() => useHomepagePublicationRollback())
    const outcomes: Awaited<ReturnType<typeof result.current.rollback>>[] = []
    await act(async () => {
      outcomes.push(await result.current.rollback('publication-old', '  دلیل  '))
    })
    expect(mockRollback).toHaveBeenCalledWith('publication-old', {
      note: 'دلیل',
    })
    expect(outcomes[0]).toMatchObject({
      status: 'success',
      publication: rolledBack,
    })
  })

  it.each([
    [403, 'forbidden'],
    [404, 'not-found'],
    [400, 'error'],
  ])('maps HTTP %s to %s', async (status, expected) => {
    mockRollback.mockRejectedValueOnce(
      new ApiError(status, {
        statusCode: status,
        error: 'ERROR',
        message: 'پیام سرور',
      } as never),
    )
    const { result } = renderHook(() => useHomepagePublicationRollback())
    const outcomes: Awaited<ReturnType<typeof result.current.rollback>>[] = []
    await act(async () => {
      outcomes.push(await result.current.rollback('publication-old'))
    })
    expect(outcomes[0]?.status).toBe(expected)
  })

  it('preserves conflict status and dependency details', async () => {
    mockRollback.mockRejectedValueOnce(
      new ApiError(409, {
        statusCode: 409,
        error: 'HOMEPAGE_ROLLBACK_INVALID',
        message: 'محتوای این نسخه سازگار نیست.',
        errors: [
          {
            path: 'sections[0].settings.items',
            code: 'EMPTY',
            message: 'بخش خالی است.',
            severity: 'ERROR',
            category: 'STRUCTURAL',
          },
        ],
        warnings: [
          {
            path: 'sections[1].settings.title',
            code: 'SHORT',
            message: 'عنوان کوتاه است.',
            severity: 'WARNING',
            category: 'WARNING',
          },
        ],
      } as never),
    )
    const { result } = renderHook(() => useHomepagePublicationRollback())
    const outcomes: Awaited<ReturnType<typeof result.current.rollback>>[] = []
    await act(async () => {
      outcomes.push(await result.current.rollback('publication-old'))
    })
    expect(outcomes[0]).toMatchObject({
      status: 'conflict',
      errorCode: 'HOMEPAGE_ROLLBACK_INVALID',
      errors: [expect.objectContaining({ code: 'EMPTY' })],
      warnings: [expect.objectContaining({ code: 'SHORT' })],
    })
  })

  it('preserves currentStatus for an ineligible target', async () => {
    mockRollback.mockRejectedValueOnce(
      new ApiError(409, {
        statusCode: 409,
        error: 'HOMEPAGE_ROLLBACK_TARGET_INVALID',
        message: 'فقط نسخه‌های تاریخی قابل بازگردانی هستند.',
        currentStatus: 'PUBLISHED',
      } as never),
    )
    const { result } = renderHook(() => useHomepagePublicationRollback())
    const outcomes: Awaited<ReturnType<typeof result.current.rollback>>[] = []
    await act(async () => {
      outcomes.push(await result.current.rollback('publication-old'))
    })
    expect(outcomes[0]).toMatchObject({
      status: 'conflict',
      currentStatus: 'PUBLISHED',
    })
  })

  it('treats a network failure as ambiguous without retrying', async () => {
    mockRollback.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useHomepagePublicationRollback())
    const outcomes: Awaited<ReturnType<typeof result.current.rollback>>[] = []
    await act(async () => {
      outcomes.push(await result.current.rollback('publication-old'))
    })
    expect(outcomes[0]?.status).toBe('ambiguous')
    expect(mockRollback).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate rollback requests', async () => {
    let resolveRollback: ((value: HomepagePublicationDto) => void) | null = null
    mockRollback.mockImplementation(
      () =>
        new Promise<HomepagePublicationDto>((resolve) => {
          resolveRollback = resolve
        }),
    )
    const { result } = renderHook(() => useHomepagePublicationRollback())
    let first: Promise<unknown> | null = null
    await act(async () => {
      first = result.current.rollback('publication-old')
      await Promise.resolve()
    })
    let second: Awaited<ReturnType<typeof result.current.rollback>> | null = null
    await act(async () => {
      second = await result.current.rollback('publication-old')
    })
    expect(second).toMatchObject({ status: 'busy' })
    expect(mockRollback).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveRollback?.(rolledBack)
      await first
    })
  })
})
