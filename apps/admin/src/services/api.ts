import type { ApiErrorPayload } from '../types'

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload?: ApiErrorPayload,
  ) {
    super(payload?.message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
  }
}

interface TokenPair {
  accessToken: string
  refreshToken: string
}

interface RequestOptions {
  auth?: boolean
  allowRefresh?: boolean
}

type AuthStateListener = () => void

let accessToken: string | null = null
let refreshPromise: Promise<boolean> | null = null
const authStateListeners = new Set<AuthStateListener>()

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function onAuthStateChange(listener: AuthStateListener): () => void {
  authStateListeners.add(listener)
  return () => {
    authStateListeners.delete(listener)
  }
}

export function clearSession(): void {
  accessToken = null
  refreshPromise = null
  authStateListeners.forEach((listener) => listener())
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) {
          return false
        }
        const pair = (await response.json()) as TokenPair
        accessToken = pair.accessToken
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, allowRefresh = true } = options

  const performRequest = (): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    }
    if (auth && accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    })
  }

  let response = await performRequest()

  if (response.status === 401 && auth && allowRefresh) {
    const refreshed = await refreshSession()
    if (refreshed) {
      response = await performRequest()
    } else {
      clearSession()
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | ApiErrorPayload
      | undefined
    throw new ApiError(response.status, payload)
  }

  return (await response.json()) as T
}
