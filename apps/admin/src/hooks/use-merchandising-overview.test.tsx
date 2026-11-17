// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HomepageDraftDto,
  HomepageDraftValidationResult,
  HomepagePublicationListResponse,
  HomepagePublicationSummaryDto,
  MerchCampaignListResponse,
  MerchMediaListResponse,
} from '@sabz/types'
import { useMerchandisingOverview } from './use-merchandising-overview'
import {
  getHomepageDraft,
  listHomepagePublications,
  listMerchCampaigns,
  listMerchMedia,
  validateHomepageDraft,
} from '../services/merchandising'

vi.mock('../services/merchandising', () => ({
  getHomepageDraft: vi.fn(),
  listHomepagePublications: vi.fn(),
  listMerchCampaigns: vi.fn(),
  listMerchMedia: vi.fn(),
  validateHomepageDraft: vi.fn(),
}))

const listPublications = vi.mocked(listHomepagePublications)
const getDraft = vi.mocked(getHomepageDraft)
const validateDraft = vi.mocked(validateHomepageDraft)
const listCampaigns = vi.mocked(listMerchCampaigns)
const listMedia = vi.mocked(listMerchMedia)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const publication: HomepagePublicationSummaryDto = {
  id: 'publication-1',
  version: 7,
  status: 'PUBLISHED',
  publishAt: null,
  publishedAt: '2026-11-10T10:00:00.000Z',
  sourceDraftRevision: 4,
  rollbackFromPublicationId: null,
  note: null,
  createdBy: 'user-1',
  publishedBy: 'user-1',
  createdAt: '2026-11-10T10:00:00.000Z',
}

const draft: HomepageDraftDto = {
  revision: 4,
  schemaVersion: 1,
  sections: [],
  updatedAt: '2026-11-10T09:00:00.000Z',
}

const validation: HomepageDraftValidationResult = {
  revision: 4,
  schemaVersion: 1,
  valid: true,
  errors: [],
  warnings: [],
}

function publicationList(
  items: HomepagePublicationSummaryDto[],
  total = items.length,
): HomepagePublicationListResponse {
  return { items, total, page: 1, limit: 5 }
}

const campaignList: MerchCampaignListResponse = {
  items: [
    {
      id: 'campaign-1',
      internalName: 'campaign-internal',
      type: 'SEASONAL',
      titleFa: 'کمپین',
      status: 'ACTIVE_WINDOW',
      scheduleStatus: 'ACTIVE',
      isEnabled: true,
      isArchived: false,
      startsAt: null,
      endsAt: null,
      priority: 0,
      archivedAt: null,
      updatedAt: '2026-11-10T10:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 5,
}

const mediaList: MerchMediaListResponse = {
  items: [
    {
      id: 'media-1',
      originalName: 'hero.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      width: 1200,
      height: 800,
      altFa: null,
      status: 'DRAFT',
      publishedAt: null,
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  limit: 5,
}

describe('useMerchandisingOverview (SS-282)', () => {
  beforeEach(() => {
    listPublications.mockReset()
    getDraft.mockReset()
    validateDraft.mockReset()
    listCampaigns.mockReset()
    listMedia.mockReset()

    listPublications.mockImplementation(async (query = {}) =>
      query.status === 'PUBLISHED'
        ? publicationList([publication], 1)
        : publicationList([], 0),
    )
    getDraft.mockResolvedValue(draft)
    validateDraft.mockResolvedValue(validation)
    listCampaigns.mockResolvedValue(campaignList)
    listMedia.mockResolvedValue(mediaList)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses only bounded requests and loads every section independently', async () => {
    const { result } = renderHook(() => useMerchandisingOverview())

    await waitFor(() => expect(result.current.currentPublication.loading).toBe(false))
    await waitFor(() => expect(result.current.scheduledPublications.loading).toBe(false))
    await waitFor(() => expect(result.current.draft.loading).toBe(false))
    await waitFor(() => expect(result.current.campaigns.loading).toBe(false))
    await waitFor(() => expect(result.current.media.loading).toBe(false))
    await waitFor(() => expect(result.current.draftValidation.loading).toBe(false))

    expect(listPublications).toHaveBeenCalledWith({
      status: 'PUBLISHED',
      page: 1,
      limit: 1,
    })
    expect(listPublications).toHaveBeenCalledWith({
      status: 'SCHEDULED',
      page: 1,
      limit: 5,
    })
    expect(getDraft).toHaveBeenCalledTimes(1)
    expect(validateDraft).toHaveBeenCalledWith({})
    expect(listCampaigns).toHaveBeenCalledWith({ page: 1, limit: 5 })
    expect(listMedia).toHaveBeenCalledWith({ page: 1, limit: 5 })
    expect(result.current.currentPublication.data?.id).toBe('publication-1')
    expect(result.current.campaigns.data?.total).toBe(1)
    expect(result.current.media.data?.total).toBe(1)
  })

  it('starts validation only after the draft has loaded', async () => {
    const pendingDraft = deferred<HomepageDraftDto>()
    getDraft.mockReturnValueOnce(pendingDraft.promise)

    const { result } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(getDraft).toHaveBeenCalledTimes(1))
    expect(validateDraft).not.toHaveBeenCalled()

    pendingDraft.resolve(draft)
    await waitFor(() => expect(validateDraft).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.draft.data).toEqual(draft))
  })

  it('does not start validation when draft loading fails', async () => {
    getDraft.mockRejectedValueOnce(new Error('draft unavailable'))

    const { result } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(result.current.draft.error).not.toBeNull())

    expect(validateDraft).not.toHaveBeenCalled()
  })

  it('keeps other sections usable when one request fails', async () => {
    listPublications.mockImplementation(async (query = {}) => {
      if (query.status === 'PUBLISHED') {
        throw new Error('publications unavailable')
      }
      return publicationList([], 0)
    })
    listCampaigns.mockRejectedValueOnce(new Error('campaigns unavailable'))

    const { result } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(result.current.currentPublication.error).not.toBeNull())
    await waitFor(() => expect(result.current.campaigns.error).not.toBeNull())
    await waitFor(() => expect(result.current.draft.data).toEqual(draft))
    await waitFor(() => expect(result.current.media.data?.total).toBe(1))

    expect(result.current.currentPublication.data).toBeNull()
    expect(result.current.scheduledPublications.error).toBeNull()
    expect(result.current.draft.error).toBeNull()
    expect(result.current.media.error).toBeNull()
  })

  it('retries only the failed section', async () => {
    listPublications.mockImplementation(async (query = {}) => {
      if (query.status === 'PUBLISHED') throw new Error('temporary')
      return publicationList([], 0)
    })

    const { result } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(result.current.currentPublication.error).not.toBeNull())
    const campaignCalls = listCampaigns.mock.calls.length
    const mediaCalls = listMedia.mock.calls.length

    listPublications.mockImplementation(async (query = {}) =>
      query.status === 'PUBLISHED'
        ? publicationList([publication], 1)
        : publicationList([], 0),
    )
    act(() => result.current.currentPublication.reload())
    await waitFor(() => expect(result.current.currentPublication.data?.id).toBe('publication-1'))

    expect(listCampaigns.mock.calls.length).toBe(campaignCalls)
    expect(listMedia.mock.calls.length).toBe(mediaCalls)
  })

  it('keeps draft data when validation fails and retries validation only', async () => {
    validateDraft.mockRejectedValueOnce(new Error('validation unavailable'))

    const { result } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(result.current.draft.data).toEqual(draft))
    await waitFor(() => expect(result.current.draftValidation.error).not.toBeNull())
    expect(result.current.draftValidation.data).toBeNull()

    const draftCalls = getDraft.mock.calls.length
    const campaignCalls = listCampaigns.mock.calls.length
    validateDraft.mockResolvedValueOnce(validation)

    act(() => result.current.draftValidation.reload())
    await waitFor(() => expect(result.current.draftValidation.data).toEqual(validation))

    expect(getDraft.mock.calls.length).toBe(draftCalls)
    expect(listCampaigns.mock.calls.length).toBe(campaignCalls)
  })

  it('does not start validation after unmounting during draft load', async () => {
    const pendingDraft = deferred<HomepageDraftDto>()
    getDraft.mockReturnValueOnce(pendingDraft.promise)

    const { unmount } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(getDraft).toHaveBeenCalledTimes(1))

    unmount()
    pendingDraft.resolve(draft)
    await Promise.resolve()

    expect(validateDraft).not.toHaveBeenCalled()
  })

  it('keeps the newest response when an older request resolves later', async () => {
    const first = deferred<HomepagePublicationListResponse>()
    const second = deferred<HomepagePublicationListResponse>()
    let publishedCalls = 0
    listPublications.mockImplementation((query = {}) => {
      if (query.status !== 'PUBLISHED') {
        return Promise.resolve(publicationList([], 0))
      }
      publishedCalls += 1
      return publishedCalls === 1 ? first.promise : second.promise
    })

    const { result } = renderHook(() => useMerchandisingOverview())
    await waitFor(() => expect(getDraft).toHaveBeenCalledTimes(1))

    act(() => result.current.currentPublication.reload())
    await waitFor(() => expect(publishedCalls).toBe(2))

    second.resolve(publicationList([{ ...publication, id: 'new' }], 1))
    await waitFor(() => expect(result.current.currentPublication.data?.id).toBe('new'))

    first.resolve(publicationList([{ ...publication, id: 'old' }], 1))
    await waitFor(() => expect(result.current.currentPublication.loading).toBe(false))
    expect(result.current.currentPublication.data?.id).toBe('new')
  })
})
