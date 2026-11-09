import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  request,
  requestBlob,
  requestMultipart,
  requestMultipartWithProgress,
} from './api'
import {
  archiveMerchCampaign,
  buildCampaignListQuery,
  buildMediaListQuery,
  buildPublicationListQuery,
  cancelHomepagePublication,
  createHomepagePublication,
  createMerchCampaign,
  deleteMerchMedia,
  getHomepageDraft,
  getMerchCampaign,
  getMerchMediaFile,
  getMerchMediaThumbnail,
  listHomepagePublications,
  listMerchCampaigns,
  listMerchMedia,
  replaceHomepageDraft,
  rollbackHomepagePublication,
  updateMerchCampaign,
  updateMerchMedia,
  uploadMerchMedia,
  validateHomepageDraft,
} from './merchandising'

vi.mock('./api', () => ({
  request: vi.fn(),
  requestBlob: vi.fn(),
  requestMultipart: vi.fn(),
  requestMultipartWithProgress: vi.fn(),
}))

const requestMock = vi.mocked(request)
const requestBlobMock = vi.mocked(requestBlob)
const requestMultipartMock = vi.mocked(requestMultipart)
const requestMultipartWithProgressMock = vi.mocked(requestMultipartWithProgress)

describe('merchandising service foundations (SS-273)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('forwards campaign filters, including explicit false booleans', () => {
    const url = buildCampaignListQuery({
      page: 2,
      limit: 50,
      q: 'نوروز',
      type: 'SEASONAL',
      isEnabled: false,
      isArchived: true,
    })
    const params = new URLSearchParams(url.split('?')[1])

    expect(url.startsWith('/admin/merchandising/campaigns?')).toBe(true)
    expect(params.get('page')).toBe('2')
    expect(params.get('limit')).toBe('50')
    expect(params.get('q')).toBe('نوروز')
    expect(params.get('type')).toBe('SEASONAL')
    expect(params.get('isEnabled')).toBe('false')
    expect(params.get('isArchived')).toBe('true')
  })

  it('omits unset campaign filters', () => {
    expect(buildCampaignListQuery()).toBe('/admin/merchandising/campaigns')
  })

  it('forwards media filters and preserves false isPublished', () => {
    const url = buildMediaListQuery({
      page: 1,
      limit: 50,
      q: 'hero',
      isPublished: false,
    })
    const params = new URLSearchParams(url.split('?')[1])

    expect(url.startsWith('/admin/merchandising/media?')).toBe(true)
    expect(params.get('limit')).toBe('50')
    expect(params.get('q')).toBe('hero')
    expect(params.get('isPublished')).toBe('false')
  })

  it('forwards publication status and pagination', () => {
    const url = buildPublicationListQuery({
      page: 3,
      limit: 20,
      status: 'SCHEDULED',
    })
    const params = new URLSearchParams(url.split('?')[1])

    expect(url.startsWith('/admin/merchandising/homepage/publications?')).toBe(
      true,
    )
    expect(params.get('page')).toBe('3')
    expect(params.get('status')).toBe('SCHEDULED')
  })

  it('uses the shared gateway for campaign reads and lifecycle actions', async () => {
    requestMock.mockResolvedValue({} as never)

    await listMerchCampaigns({ isEnabled: true })
    await getMerchCampaign('campaign-1')
    await createMerchCampaign({ internalName: 'x', type: 'SEASONAL', titleFa: 'x' })
    await updateMerchCampaign('campaign-1', { priority: 4 })
    await archiveMerchCampaign('campaign-1')

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      '/admin/merchandising/campaigns?isEnabled=true',
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      '/admin/merchandising/campaigns/campaign-1',
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      3,
      '/admin/merchandising/campaigns',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      4,
      '/admin/merchandising/campaigns/campaign-1',
      expect.objectContaining({ method: 'PATCH', body: '{"priority":4}' }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      5,
      '/admin/merchandising/campaigns/campaign-1/archive',
      { method: 'POST' },
    )
  })

  it('uses only the alt field for media updates and authenticated binaries', async () => {
    requestMock.mockResolvedValue({} as never)
    requestBlobMock.mockResolvedValue(new Blob())

    await listMerchMedia({ isPublished: false })
    await updateMerchMedia('media-1', { altFa: 'تصویر کمپین' })
    await deleteMerchMedia('media-1')
    await getMerchMediaFile('media-1')
    await getMerchMediaThumbnail('media-1')

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      '/admin/merchandising/media?isPublished=false',
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      '/admin/merchandising/media/media-1',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"altFa":"تصویر کمپین"}',
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      3,
      '/admin/merchandising/media/media-1',
      { method: 'DELETE' },
    )
    expect(requestBlobMock).toHaveBeenNthCalledWith(
      1,
      '/admin/merchandising/media/media-1/file',
    )
    expect(requestBlobMock).toHaveBeenNthCalledWith(
      2,
      '/admin/merchandising/media/media-1/thumbnail',
    )
  })

  it('uses the draft and publication endpoints without inventing fields', async () => {
    requestMock.mockResolvedValue({} as never)

    await getHomepageDraft()
    await replaceHomepageDraft({ revision: 4, sections: [] })
    await validateHomepageDraft({ revision: 4, sections: [] })
    await listHomepagePublications({ status: 'PUBLISHED', limit: 5 })
    await createHomepagePublication({ note: 'انتشار دستی' })
    await cancelHomepagePublication('publication-1')
    await rollbackHomepagePublication('publication-1', { note: 'بازگشت' })

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      '/admin/merchandising/homepage/draft',
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      '/admin/merchandising/homepage/draft',
      expect.objectContaining({
        method: 'PUT',
        body: '{"revision":4,"sections":[]}',
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      3,
      '/admin/merchandising/homepage/draft/validate',
      expect.objectContaining({
        method: 'POST',
        body: '{"revision":4,"sections":[]}',
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      4,
      '/admin/merchandising/homepage/publications?limit=5&status=PUBLISHED',
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      5,
      '/admin/merchandising/homepage/publications',
      expect.objectContaining({
        method: 'POST',
        body: '{"note":"انتشار دستی"}',
      }),
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      6,
      '/admin/merchandising/homepage/publications/publication-1/cancel',
      { method: 'POST' },
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      7,
      '/admin/merchandising/homepage/publications/publication-1/rollback',
      expect.objectContaining({
        method: 'POST',
        body: '{"note":"بازگشت"}',
      }),
    )
  })

  it('uploads media with optional alt text and upload progress', async () => {
    requestMultipartMock.mockResolvedValue({} as never)
    requestMultipartWithProgressMock.mockResolvedValue({} as never)
    const file = new Blob(['image']) as File

    await uploadMerchMedia(file, { altFa: '  تصویر کمپین  ' })
    const [plainPath, plainForm] = requestMultipartMock.mock.calls[0]!
    expect(plainPath).toBe('/admin/merchandising/media')
    expect(plainForm.get('altFa')).toBe('تصویر کمپین')
    expect(plainForm.get('file')).toBeTruthy()

    const onProgress = vi.fn()
    await uploadMerchMedia(file, { onProgress })
    expect(requestMultipartWithProgressMock).toHaveBeenCalledWith(
      '/admin/merchandising/media',
      expect.any(FormData),
      onProgress,
    )
  })
})
