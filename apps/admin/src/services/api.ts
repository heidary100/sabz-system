import { ApiError, createApiClient } from '@sabz/api-client'
import type { TokenPair } from '@sabz/types'

export { ApiError }

export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

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

const client = createApiClient({
  baseUrl: API_BASE_URL,
  credentials: 'include',
})

export async function request<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const { auth = true, allowRefresh = true } = options

  const performRequest = (): Promise<T> =>
    client.request<T>(path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    })

  try {
    return await performRequest()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && auth && allowRefresh) {
      const refreshed = await refreshSession()
      if (refreshed) {
        return performRequest()
      }
      clearSession()
    }
    throw error
  }
}
