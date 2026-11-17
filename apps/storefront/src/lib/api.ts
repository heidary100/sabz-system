import { createApiClient } from '@sabz/api-client'
import {
  resolveBrowserApiBaseUrl,
  resolveInternalApiBaseUrl,
  resolveMediaBaseUrl,
} from './api-url'

export { ApiError } from '@sabz/api-client'

const production = process.env.NODE_ENV === 'production'

/**
 * Browser-facing API origin. Absolute HTTP(S) or a root-relative same-origin
 * path such as `/api/v1` are both valid.
 */
export const API_BASE_URL = resolveBrowserApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  production,
)

/**
 * API origin as seen by the Next.js image optimizer. It may be the
 * compose-internal hostname or a same-origin path; next/image handles a
 * root-relative source without a remote pattern.
 */
export const MEDIA_BASE_URL = resolveMediaBaseUrl(
  process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  API_BASE_URL,
)

/**
 * Server components fetch through an absolute internal API origin. In Docker
 * that is the compose service name; outside Docker an absolute browser base
 * is reused. A relative browser base requires an explicit internal origin.
 */
const SERVER_API_BASE_URL =
  typeof window === 'undefined'
    ? resolveInternalApiBaseUrl(process.env.API_INTERNAL_BASE_URL, API_BASE_URL)
    : API_BASE_URL

const client = createApiClient({
  baseUrl:
    typeof window === 'undefined' ? SERVER_API_BASE_URL : API_BASE_URL,
})

export const request = client.request
