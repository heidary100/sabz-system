import type { ApiErrorPayload } from '@sabz/types'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload?: ApiErrorPayload,
  ) {
    super(payload?.message ?? `Request failed with status ${status}`)
    this.name = 'ApiError'
  }
}

export interface ApiClientConfig {
  baseUrl: string
  credentials?: RequestCredentials
  defaultHeaders?: Record<string, string>
}

export interface ApiClient {
  readonly baseUrl: string
  request<T>(path: string, init?: RequestInit): Promise<T>
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '')
  const defaultHeaders = { 'Content-Type': 'application/json', ...config.defaultHeaders }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...defaultHeaders,
        ...(init.headers as Record<string, string> | undefined),
      },
      ...(config.credentials !== undefined && { credentials: config.credentials }),
    })

    if (!response.ok) {
      const payload = (await response.json().catch(() => undefined)) as
        | ApiErrorPayload
        | undefined
      throw new ApiError(response.status, payload)
    }

    return (await response.json()) as T
  }

  return { baseUrl, request }
}
