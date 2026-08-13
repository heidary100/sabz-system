import { ApiError, createApiClient } from './api-client'

const mockFetch = jest.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  mockFetch.mockReset()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

describe('createApiClient', () => {
  it('requests the base URL joined with the path', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1' })
    await client.request('/auth/me')

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/auth/me', expect.anything())
  })

  it('normalizes a trailing slash on the base URL', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1/' })
    await client.request('/auth/me')

    expect(mockFetch).toHaveBeenCalledWith('/api/v1/auth/me', expect.anything())
  })

  it('sends the default JSON content type', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1' })
    await client.request('/auth/me')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('merges caller headers over the defaults', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1' })
    await client.request('/auth/me', {
      headers: { 'Content-Type': 'text/plain', 'X-Custom': '1' },
    })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain', 'X-Custom': '1' })
  })

  it('merges configured default headers over the built-in JSON content type', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({
      baseUrl: '/api/v1',
      defaultHeaders: { Accept: 'application/json' },
    })
    await client.request('/auth/me')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    })
  })

  it('applies credentials when configured', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1', credentials: 'include' })
    await client.request('/auth/me')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBe('include')
  })

  it('omits credentials when not configured', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1' })
    await client.request('/auth/me')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.credentials).toBeUndefined()
  })

  it('returns parsed JSON for successful responses', async () => {
    const body = { id: 'user-1', mobile: '09120000000' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))

    const client = createApiClient({ baseUrl: '/api/v1' })
    const result = await client.request<typeof body>('/auth/me')

    expect(result).toEqual(body)
  })

  it('throws ApiError with status and payload for error responses', async () => {
    const payload = { statusCode: 404, message: 'Not found.', error: 'Not Found' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(payload), { status: 404 }))

    const client = createApiClient({ baseUrl: '/api/v1' })

    await expect(client.request('/missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      payload,
      message: 'Not found.',
    })
  })

  it('throws ApiError with status only when the body is not JSON', async () => {
    mockFetch.mockResolvedValue(new Response('Internal Server Error', { status: 500 }))

    const client = createApiClient({ baseUrl: '/api/v1' })

    await expect(client.request('/broken')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      payload: undefined,
      message: 'Request failed with status 500',
    })
  })

  it('throws ApiError instances', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: 'nope' }), { status: 400 }))

    const client = createApiClient({ baseUrl: '/api/v1' })

    await expect(client.request('/bad')).rejects.toBeInstanceOf(ApiError)
  })
})
