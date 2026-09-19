import { createApiClient } from '@sabz/api-client'

export { ApiError } from '@sabz/api-client'

/** Browser-facing API origin — also the origin that hosts product media. */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1'

/**
 * Server components resolve the API through the compose-internal hostname
 * when deployed in Docker: the browser-facing URL (published port) is not
 * reachable from inside the storefront container. Outside Docker both point
 * at the same address.
 */
const SERVER_API_BASE_URL =
  process.env.API_INTERNAL_BASE_URL ?? API_BASE_URL

const client = createApiClient({
  baseUrl:
    typeof window === 'undefined' ? SERVER_API_BASE_URL : API_BASE_URL,
})

export const request = client.request
