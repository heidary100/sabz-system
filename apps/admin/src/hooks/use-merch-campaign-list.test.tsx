// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MerchCampaignListResponse,
  MerchCampaignSummaryDto,
} from '@sabz/types'
import { useMerchCampaignList } from './use-merch-campaign-list'
import { listMerchCampaigns } from '../services/merchandising'

vi.mock('../services/merchandising', () => ({
  listMerchCampaigns: vi.fn(),
}))

const mockList = vi.mocked(listMerchCampaigns)

function campaign(id: string): MerchCampaignSummaryDto {
  return {
    id,
    internalName: id,
    type: 'SEASONAL',
    titleFa: id,
    status: 'ACTIVE_WINDOW',
    scheduleStatus: 'ACTIVE',
    isEnabled: true,
    isArchived: false,
    startsAt: null,
    endsAt: null,
    priority: 0,
    archivedAt: null,
    updatedAt: '2026-11-09T10:00:00.000Z',
  }
}

function result(
  items: MerchCampaignSummaryDto[],
  total = items.length,
): MerchCampaignListResponse {
  return { items, total, page: 1, limit: 20 }
}

describe('useMerchCampaignList (SS-275)', () => {
  beforeEach(() => {
    mockList.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to non-archived campaigns with server pagination', async () => {
    mockList.mockResolvedValue(result([]))
    const { result: hook } = renderHook(() => useMerchCampaignList())

    await waitFor(() => expect(hook.current.loading).toBe(false))
    expect(mockList).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: undefined,
      type: undefined,
      isEnabled: undefined,
      isArchived: false,
    })
  })

  it('forwards search, type, enabled, and archived filters', async () => {
    mockList.mockResolvedValue(result([]))
    const { result: hook } = renderHook(() => useMerchCampaignList())
    await waitFor(() => expect(hook.current.loading).toBe(false))

    act(() => hook.current.setSearch('پاییز'))
    act(() => hook.current.setType('SEASONAL'))
    act(() => hook.current.setEnabled('false'))
    act(() => hook.current.setArchived('true'))

    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        q: 'پاییز',
        type: 'SEASONAL',
        isEnabled: false,
        isArchived: true,
      }),
    )
  })

  it('keeps the newest response when an old request resolves later', async () => {
    let resolveFirst: (value: MerchCampaignListResponse) => void = () => {}
    let resolveSecond: (value: MerchCampaignListResponse) => void = () => {}
    mockList
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveSecond = resolve)),
      )

    const { result: hook } = renderHook(() => useMerchCampaignList())
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(1))

    act(() => hook.current.setSearch('new'))
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))

    await act(async () => resolveSecond(result([campaign('new')])))
    await waitFor(() => expect(hook.current.result?.items[0]?.id).toBe('new'))

    await act(async () => resolveFirst(result([campaign('old')])))
    await waitFor(() => expect(hook.current.loading).toBe(false))
    expect(hook.current.result?.items[0]?.id).toBe('new')
  })
})
