// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHomepagePublicationList } from './use-homepage-publication-list'
import { listHomepagePublications } from '../services/merchandising'

vi.mock('../services/merchandising', () => ({
  listHomepagePublications: vi.fn(),
}))

const mockList = vi.mocked(listHomepagePublications)

describe('useHomepagePublicationList (SS-280)', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockList.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads a server-paginated page without a status filter', async () => {
    const { result } = renderHook(() => useHomepagePublicationList())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockList).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      status: undefined,
    })
  })

  it('resets the page when the status or page size changes', async () => {
    const { result } = renderHook(() => useHomepagePublicationList())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setPage(3)
    })
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        page: 3,
        limit: 20,
        status: undefined,
      }),
    )

    act(() => {
      result.current.setStatus('SCHEDULED')
    })
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        status: 'SCHEDULED',
      }),
    )

    act(() => {
      result.current.setLimit(50)
    })
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        page: 1,
        limit: 50,
        status: 'SCHEDULED',
      }),
    )
  })

  it('resets the page when a mutation leaves the current page empty', async () => {
    mockList
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 20 })
      .mockResolvedValueOnce({ items: [], total: 0, page: 2, limit: 20 })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 20 })
    const { result } = renderHook(() => useHomepagePublicationList())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setPage(2)
    })
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        status: undefined,
      }),
    )
    expect(result.current.page).toBe(1)
  })
})
