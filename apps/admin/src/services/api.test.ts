import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Session-refresh contract (SS-900 final): a 401 may trigger one refresh, but
 * only an explicit 401/403 from `/auth/refresh` ends the session. Throttling,
 * gateway errors and network failures must leave the in-memory session intact.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadApi() {
  vi.resetModules()
  return import('./api')
}

describe('admin refresh classification', () => {
  it('stores the new token on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ accessToken: 'new-token' })),
    )
    const api = await loadApi()
    await expect(api.refreshSession()).resolves.toBe('refreshed')
    expect(api.getAccessToken()).toBe('new-token')
  })

  it('treats 401/403 as an expired session', async () => {
    for (const status of [401, 403]) {
      vi.resetModules()
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(null, { status })),
      )
      const api = await loadApi()
      await expect(api.refreshSession()).resolves.toBe('expired')
    }
  })

  it('keeps throttling, 5xx, malformed success and network failures transient', async () => {
    const cases: Array<() => Response | Promise<Response>> = [
      () => new Response(null, { status: 429 }),
      () => new Response(null, { status: 500 }),
      () => new Response(null, { status: 503 }),
      () => jsonResponse({ accessToken: '' }),
      () => {
        throw new TypeError('network down')
      },
    ]
    for (const makeResponse of cases) {
      vi.resetModules()
      vi.stubGlobal('fetch', vi.fn(async () => makeResponse()))
      const api = await loadApi()
      await expect(api.refreshSession()).resolves.toBe('unavailable')
    }
  })

  it('does not clear an existing session when a 401 refresh is throttled', async () => {
    const listener = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/auth/refresh')) {
          return new Response(null, { status: 429 })
        }
        return jsonResponse(
          { message: 'Invalid or expired access token.', statusCode: 401 },
          401,
        )
      }),
    )
    const api = await loadApi()
    api.setAccessToken('existing-token')
    api.onAuthStateChange(listener)

    await expect(api.request('/admin/protected')).rejects.toMatchObject({
      status: 401,
    })
    expect(listener).not.toHaveBeenCalled()
    expect(api.getAccessToken()).toBe('existing-token')
  })

  it('clears the session only when the refresh endpoint rejects the refresh token', async () => {
    const listener = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/auth/refresh')) {
          return new Response(null, { status: 401 })
        }
        return jsonResponse(
          { message: 'Invalid or expired access token.', statusCode: 401 },
          401,
        )
      }),
    )
    const api = await loadApi()
    api.setAccessToken('existing-token')
    api.onAuthStateChange(listener)

    await expect(api.request('/admin/protected')).rejects.toMatchObject({
      status: 401,
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(api.getAccessToken()).toBeNull()
  })
})
