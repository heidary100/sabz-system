import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishedHomepageFixture } from './__fixtures__/published-homepage'

const api = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly payload?: unknown,
    ) {
      super('api error')
      this.name = 'ApiError'
    }
  }
  return { ApiError, request: api.request }
})

import { ApiError } from '@/lib/api'
import { fetchPublishedHomepage } from './homepage'

afterEach(() => {
  vi.restoreAllMocks()
  api.request.mockReset()
})

describe('fetchPublishedHomepage', () => {
  it('returns the published homepage with an explicit no-store request', async () => {
    const homepage = publishedHomepageFixture()
    api.request.mockResolvedValue(homepage)

    const result = await fetchPublishedHomepage()

    expect(result).toEqual({ status: 'published', homepage })
    expect(api.request).toHaveBeenCalledWith(
      '/catalog/homepage',
      expect.objectContaining({ cache: 'no-store' }),
    )
    const init = api.request.mock.calls[0]![1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('treats the deterministic version:null response as no publication', async () => {
    api.request.mockResolvedValue({
      version: null,
      schemaVersion: null,
      publishedAt: null,
      sections: [],
    })

    await expect(fetchPublishedHomepage()).resolves.toEqual({ status: 'empty' })
  })

  it('treats a published homepage with zero sections as empty output, not a static fallback', async () => {
    api.request.mockResolvedValue(publishedHomepageFixture({ sections: [] }))

    const result = await fetchPublishedHomepage()

    expect(result).toMatchObject({
      status: 'published',
      homepage: { version: 7, sections: [] },
    })
  })

  it('ignores orphan sections on an unpublished envelope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.request.mockResolvedValue(
      publishedHomepageFixture({ version: null, sections: [] }),
    )

    await expect(fetchPublishedHomepage()).resolves.toEqual({ status: 'empty' })
  })

  it('classifies API status failures without exposing the response body', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.request.mockRejectedValue(new ApiError(503))

    await expect(fetchPublishedHomepage()).resolves.toEqual({
      status: 'unavailable',
      reason: 'http',
      httpStatus: 503,
    })
  })

  it('classifies network failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.request.mockRejectedValue(new TypeError('fetch failed'))

    await expect(fetchPublishedHomepage()).resolves.toEqual({
      status: 'unavailable',
      reason: 'network',
    })
  })

  it('classifies timeouts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.request.mockRejectedValue(
      new DOMException('The operation timed out.', 'TimeoutError'),
    )

    await expect(fetchPublishedHomepage()).resolves.toEqual({
      status: 'unavailable',
      reason: 'timeout',
    })
  })

  it.each([
    ['a non-object envelope', 'nope'],
    ['a missing sections array', { version: 1, schemaVersion: 1, publishedAt: null }],
    ['an invalid version', { version: '7', schemaVersion: 1, publishedAt: null, sections: [] }],
    ['an invalid schema version', { version: 7, schemaVersion: '1', publishedAt: null, sections: [] }],
    ['an invalid publication timestamp', { version: 7, schemaVersion: 1, publishedAt: 4, sections: [] }],
  ])('rejects %s as unavailable', async (_label, payload) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api.request.mockResolvedValue(payload)

    await expect(fetchPublishedHomepage()).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid',
    })
  })

  it('logs a sanitized diagnostic', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.request.mockRejectedValue(new ApiError(500))

    await fetchPublishedHomepage()

    expect(log).toHaveBeenCalledWith(
      '[storefront:homepage] Homepage request failed status=500',
    )
    expect(JSON.stringify(log.mock.calls)).not.toContain('stack')
  })
})
