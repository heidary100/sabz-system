// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomepagePublicationDto } from '@sabz/types'
import { useHomepagePublicationCancel } from './use-homepage-publication-cancel'
import { cancelHomepagePublication } from '../services/merchandising'
import { ApiError } from '../services/api'

vi.mock('../services/merchandising', () => ({
  cancelHomepagePublication: vi.fn(),
}))

const mockCancel = vi.mocked(cancelHomepagePublication)

const publication: HomepagePublicationDto = {
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

describe('useHomepagePublicationCancel (SS-280)', () => {
  beforeEach(() => {
    mockCancel.mockReset()
    mockCancel.mockResolvedValue(publication)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns the server-confirmed publication', async () => {
    const { result } = renderHook(() => useHomepagePublicationCancel())
    const outcomes: Awaited<ReturnType<typeof result.current.cancel>>[] = []
    await act(async () => {
      outcomes.push(await result.current.cancel('publication-2'))
    })
    expect(mockCancel).toHaveBeenCalledWith('publication-2')
    expect(outcomes[0]).toMatchObject({
      status: 'success',
      publication,
    })
  })

  it.each([
    [403, 'forbidden'],
    [404, 'not-found'],
    [409, 'conflict'],
  ])('maps HTTP %s to %s', async (status, expected) => {
    mockCancel.mockRejectedValueOnce(
      new ApiError(status, {
        statusCode: status,
        error: 'ERROR',
        message: 'پیام سرور',
        currentStatus: 'PUBLISHED',
      } as never),
    )
    const { result } = renderHook(() => useHomepagePublicationCancel())
    const outcomes: Awaited<ReturnType<typeof result.current.cancel>>[] = []
    await act(async () => {
      outcomes.push(await result.current.cancel('publication-2'))
    })
    expect(outcomes[0]?.status).toBe(expected)
    if (expected === 'conflict') {
      expect(outcomes[0]).toMatchObject({ currentStatus: 'PUBLISHED' })
    }
  })

  it('treats a network failure as ambiguous without retrying', async () => {
    mockCancel.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useHomepagePublicationCancel())
    const outcomes: Awaited<ReturnType<typeof result.current.cancel>>[] = []
    await act(async () => {
      outcomes.push(await result.current.cancel('publication-2'))
    })
    expect(outcomes[0]?.status).toBe('ambiguous')
    expect(mockCancel).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate cancellation requests', async () => {
    let resolveCancel: ((value: HomepagePublicationDto) => void) | null = null
    mockCancel.mockImplementation(
      () =>
        new Promise<HomepagePublicationDto>((resolve) => {
          resolveCancel = resolve
        }),
    )
    const { result } = renderHook(() => useHomepagePublicationCancel())
    let first: Promise<unknown> | null = null
    await act(async () => {
      first = result.current.cancel('publication-2')
      await Promise.resolve()
    })
    let second: Awaited<ReturnType<typeof result.current.cancel>> | null = null
    await act(async () => {
      second = await result.current.cancel('publication-2')
    })
    expect(second).toMatchObject({ status: 'busy' })
    expect(mockCancel).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveCancel?.(publication)
      await first
    })
  })
})
