// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepageDraftDto,
  HomepagePublicationDto,
} from '@sabz/types'
import { useHomepagePublication } from './use-homepage-publication'
import {
  createHomepagePublication,
  getHomepageDraft,
  listHomepagePublications,
} from '../services/merchandising'
import { ApiError } from '../services/api'

vi.mock('../services/merchandising', () => ({
  createHomepagePublication: vi.fn(),
  getHomepageDraft: vi.fn(),
  listHomepagePublications: vi.fn(),
}))

const mockCreate = vi.mocked(createHomepagePublication)
const mockGetDraft = vi.mocked(getHomepageDraft)
const mockList = vi.mocked(listHomepagePublications)

const draft: HomepageDraftDto = {
  revision: 4,
  schemaVersion: 1,
  sections: [],
  updatedAt: '2026-11-10T10:00:00.000Z',
}

const publication: HomepagePublicationDto = {
  id: 'publication-1',
  version: 3,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T10:05:00.000Z',
  sourceDraftRevision: 4,
  rollbackFromPublicationId: null,
  note: 'انتشار آزمایشی',
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T10:05:00.000Z',
  schemaVersion: 1,
  sections: [],
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
)

describe('useHomepagePublication (SS-279)', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockGetDraft.mockReset()
    mockList.mockReset()
    mockGetDraft.mockResolvedValue(draft)
    mockList.mockResolvedValue({
      items: [publication],
      total: 1,
      page: 1,
      limit: 1,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads the current PUBLISHED summary once under StrictMode', async () => {
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(mockList).toHaveBeenCalledWith({
      status: 'PUBLISHED',
      page: 1,
      limit: 1,
    })
    expect(result.current.current?.version).toBe(3)
  })

  it('publishes immediately without publishAt and reports the saved revision', async () => {
    mockCreate.mockResolvedValue(publication)
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    let outcome: Awaited<ReturnType<typeof result.current.publish>> | null = null
    await act(async () => {
      outcome = await result.current.publish({
        note: '  یادداشت  ',
        expectedRevision: 4,
      })
    })

    expect(mockCreate).toHaveBeenCalledWith({ note: 'یادداشت' })
    expect(mockGetDraft).toHaveBeenCalledTimes(1)
    expect(outcome).toMatchObject({
      status: 'success',
      publication,
      expectedRevision: 4,
      revisionMismatch: false,
    })
  })

  it('does not submit when the server draft revision moved', async () => {
    mockGetDraft.mockResolvedValue({ ...draft, revision: 5 })
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    let outcome: Awaited<ReturnType<typeof result.current.publish>> | null = null
    await act(async () => {
      outcome = await result.current.publish({ expectedRevision: 4 })
    })

    expect(mockCreate).not.toHaveBeenCalled()
    expect(outcome).toMatchObject({
      status: 'conflict',
      currentRevision: 5,
    })
  })

  it('flags a response whose sourceDraftRevision differs from the confirmed revision', async () => {
    mockCreate.mockResolvedValue({ ...publication, sourceDraftRevision: 5 })
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    let outcome: Awaited<ReturnType<typeof result.current.publish>> | null = null
    await act(async () => {
      outcome = await result.current.publish({ expectedRevision: 4 })
    })
    expect(outcome).toMatchObject({
      status: 'success',
      revisionMismatch: true,
    })
  })

  it('maps publication-time 400 validation issues without dropping unknown paths', async () => {
    mockCreate.mockRejectedValue(
      new ApiError(400, {
        statusCode: 400,
        error: 'HOMEPAGE_DRAFT_INVALID',
        message: ['پیش‌نویس نامعتبر است.'],
        errors: [
          {
            path: 'sections[0].settings.limit',
            code: 'INVALID_LIMIT',
            message: 'محدودیت نامعتبر است.',
            severity: 'ERROR',
            category: 'STRUCTURAL',
          },
        ],
        warnings: [],
      } as never),
    )
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    let outcome: Awaited<ReturnType<typeof result.current.publish>> | null = null
    await act(async () => {
      outcome = await result.current.publish({ expectedRevision: 4 })
    })
    expect(outcome).toMatchObject({
      status: 'invalid',
      errors: [
        {
          path: 'sections[0].settings.limit',
          code: 'INVALID_LIMIT',
        },
      ],
    })
  })

  it('handles a 403 permission response', async () => {
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))
    mockCreate.mockRejectedValueOnce(
      new ApiError(403, {
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'ADMIN required',
      } as never),
    )
    const outcomes: Awaited<ReturnType<typeof result.current.publish>>[] = []
    await act(async () => {
      outcomes.push(await result.current.publish({ expectedRevision: 4 }))
    })
    expect(outcomes[0]?.status).toBe('forbidden')
  })

  it('handles a 409 conflict response', async () => {
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))
    mockCreate.mockRejectedValueOnce(
      new ApiError(409, {
        statusCode: 409,
        error: 'HOMEPAGE_DRAFT_SCHEMA_UNSUPPORTED',
        message: 'نسخه ساختار پشتیبانی نمی‌شود.',
      } as never),
    )
    const outcomes: Awaited<ReturnType<typeof result.current.publish>>[] = []
    await act(async () => {
      outcomes.push(await result.current.publish({ expectedRevision: 4 }))
    })
    expect(outcomes[0]?.status).toBe('conflict')
  })

  it('treats an ambiguous network failure as unknown without retrying', async () => {
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))
    mockCreate.mockRejectedValueOnce(new Error('network down'))
    const outcomes: Awaited<ReturnType<typeof result.current.publish>>[] = []
    await act(async () => {
      outcomes.push(await result.current.publish({ expectedRevision: 4 }))
    })
    expect(outcomes[0]?.status).toBe('ambiguous')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('schedules with a future UTC timestamp and note', async () => {
    const scheduled: HomepagePublicationDto = {
      ...publication,
      status: 'SCHEDULED',
      publishAt: '2030-01-01T08:30:00.000Z',
      publishedAt: null,
    }
    mockCreate.mockResolvedValue(scheduled)
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    const outcomes: Awaited<ReturnType<typeof result.current.schedule>>[] = []
    await act(async () => {
      outcomes.push(
        await result.current.schedule({
          publishAt: '2030-01-01T08:30:00.000Z',
          note: '  زمستانه  ',
          expectedRevision: 4,
        }),
      )
    })

    expect(mockCreate).toHaveBeenCalledWith({
      publishAt: '2030-01-01T08:30:00.000Z',
      note: 'زمستانه',
    })
    expect(outcomes[0]).toMatchObject({
      status: 'success',
      publication: scheduled,
    })
  })

  it('does not submit a schedule whose time is no longer in the future', async () => {
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    const outcomes: Awaited<ReturnType<typeof result.current.schedule>>[] = []
    await act(async () => {
      outcomes.push(
        await result.current.schedule({
          publishAt: '2020-01-01T08:30:00.000Z',
          expectedRevision: 4,
        }),
      )
    })
    expect(outcomes[0]).toMatchObject({
      status: 'error',
      message: expect.stringContaining('در آینده'),
    })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('prevents duplicate submissions while a request is in flight', async () => {
    let resolveCreate: ((value: HomepagePublicationDto) => void) | null = null
    mockCreate.mockImplementation(
      () =>
        new Promise<HomepagePublicationDto>((resolve) => {
          resolveCreate = resolve
        }),
    )
    const { result } = renderHook(() => useHomepagePublication(), {
      wrapper,
    })
    await waitFor(() => expect(result.current.currentLoading).toBe(false))

    let first: Promise<unknown> | null = null
    await act(async () => {
      first = result.current.publish({ expectedRevision: 4 })
      await Promise.resolve()
    })

    let second: Awaited<ReturnType<typeof result.current.publish>> | null = null
    await act(async () => {
      second = await result.current.publish({ expectedRevision: 4 })
    })
    expect(second).toMatchObject({ status: 'busy' })
    expect(mockCreate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCreate?.(publication)
      await first
    })
  })
})
