// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MerchMediaListResponse,
  MerchMediaSummaryDto,
} from '@sabz/types'
import { useMerchMediaList } from './use-merch-media-list'
import { listMerchMedia } from '../services/merchandising'

vi.mock('../services/merchandising', () => ({
  listMerchMedia: vi.fn(),
}))

const mockList = vi.mocked(listMerchMedia)

function media(id: string): MerchMediaSummaryDto {
  return {
    id,
    originalName: `${id}.png`,
    mimeType: 'image/png',
    sizeBytes: 1200,
    width: 1200,
    height: 800,
    altFa: null,
    status: 'DRAFT',
    publishedAt: null,
    createdAt: '2026-11-09T10:00:00.000Z',
    updatedAt: '2026-11-09T10:00:00.000Z',
  }
}

function result(
  items: MerchMediaSummaryDto[],
  total = items.length,
): MerchMediaListResponse {
  return { items, total, page: 1, limit: 20 }
}

describe('useMerchMediaList (SS-274)', () => {
  beforeEach(() => {
    mockList.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses server pagination and forwards search and published filters', async () => {
    mockList.mockResolvedValue(result([]))
    const { result: hook } = renderHook(() => useMerchMediaList())

    await waitFor(() => expect(hook.current.loading).toBe(false))
    expect(mockList).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: undefined,
      isPublished: undefined,
    })

    act(() => hook.current.setSearch('  hero  '))
    act(() => hook.current.setPublished('false'))
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        q: 'hero',
        isPublished: false,
      }),
    )
  })

  it('resets to page one when the page size changes', async () => {
    mockList.mockResolvedValue(result([media('a')], 100))
    const { result: hook } = renderHook(() => useMerchMediaList())
    await waitFor(() => expect(hook.current.loading).toBe(false))

    act(() => hook.current.setPage(3))
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 3, limit: 20 }),
      ),
    )

    act(() => hook.current.setLimit(50))
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, limit: 50 }),
      ),
    )
    expect(hook.current.page).toBe(1)
    expect(hook.current.limit).toBe(50)
  })

  it('keeps the newest response when an older request resolves later', async () => {
    let resolveFirst: (value: MerchMediaListResponse) => void = () => {}
    let resolveSecond: (value: MerchMediaListResponse) => void = () => {}
    mockList
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve)),
      )

    const { result: hook } = renderHook(() => useMerchMediaList())
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))

    act(() => hook.current.setSearch('new'))
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveSecond(result([media('new')]))
    })
    await waitFor(() => expect(hook.current.result?.items[0]?.id).toBe('new'))

    await act(async () => {
      resolveFirst(result([media('old')]))
    })
    await waitFor(() => expect(hook.current.loading).toBe(false))
    expect(hook.current.result?.items[0]?.id).toBe('new')
  })
})
