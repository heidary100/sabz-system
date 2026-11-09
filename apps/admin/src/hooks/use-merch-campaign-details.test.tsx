// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchCampaignDto } from '@sabz/types'
import {
  clearMerchCampaignDetailCache,
  useMerchCampaignDetails,
} from './use-merch-campaign-details'
import { getMerchCampaign } from '../services/merchandising'
import { ApiError } from '../services/api'

vi.mock('../services/merchandising', () => ({
  getMerchCampaign: vi.fn(),
}))

const mockGet = vi.mocked(getMerchCampaign)

function campaign(id: string): MerchCampaignDto {
  return {
    id,
    internalName: id,
    type: 'SEASONAL',
    titleFa: id,
    eyebrowFa: null,
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    cta: { kind: 'NONE' },
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    priority: 0,
    status: 'ACTIVE_WINDOW',
    scheduleStatus: 'ACTIVE',
    isArchived: false,
    archivedAt: null,
    updatedAt: '2026-11-09T10:00:00.000Z',
    products: [],
    categories: [],
    brands: [],
    media: [],
    usage: { currentPublications: [], scheduledPublications: [] },
    hasUnpublishedChanges: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-11-09T10:00:00.000Z',
  }
}

describe('useMerchCampaignDetails (SS-277)', () => {
  beforeEach(() => {
    clearMerchCampaignDetailCache()
    mockGet.mockReset()
  })

  afterEach(() => {
    clearMerchCampaignDetailCache()
  })

  it('deduplicates ids and reuses cached details across form remounts', async () => {
    mockGet.mockImplementation(async (id) => campaign(id))
    const first = renderHook(() =>
      useMerchCampaignDetails(['a', 'b', 'a']),
    )

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(Object.keys(first.result.current.details)).toEqual(
        expect.arrayContaining(['a', 'b']),
      ),
    )
    first.unmount()

    const second = renderHook(() => useMerchCampaignDetails(['b']))
    await waitFor(() => expect(second.result.current.details.b?.id).toBe('b'))
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('exposes bounded detail errors without failing other loads', async () => {
    mockGet.mockImplementation(async (id) => {
      if (id === 'bad') {
        throw new ApiError(404, {
          statusCode: 404,
          error: 'Not Found',
          message: 'کمپین یافت نشد.',
        })
      }
      return campaign(id)
    })
    const { result } = renderHook(() => useMerchCampaignDetails(['ok', 'bad']))

    await waitFor(() => expect(result.current.details.ok?.id).toBe('ok'))
    await waitFor(() =>
      expect(result.current.errors.bad).toContain('کمپین یافت نشد.'),
    )
    expect(result.current.details.bad).toBeUndefined()
  })
})
