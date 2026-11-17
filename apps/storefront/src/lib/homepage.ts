import type { PublishedHomepageDto } from '@sabz/types'
import { ApiError, request } from '@/lib/api'

/**
 * Published merchandising homepage data access for server components.
 *
 * The public API is the only homepage merchandising source: there is no
 * static fallback and no second application cache. `no-store` keeps the
 * storefront from adding a cross-runtime invalidation contract; the API owns
 * its own short-lived resolver cache and selects the current publication.
 */
export const HOMEPAGE_REQUEST_TIMEOUT_MS = 5_000

export type HomepageFetchFailureReason =
  | 'http'
  | 'timeout'
  | 'network'
  | 'invalid'

export type PublishedHomepageResult =
  | { status: 'published'; homepage: PublishedHomepageDto }
  | { status: 'empty' }
  | {
      status: 'unavailable'
      reason: HomepageFetchFailureReason
      httpStatus?: number
    }

/**
 * Fetch and sufficiently validate the published homepage envelope.
 *
 * A missing publication is a successful `200` with `version: null`; it is not
 * an error. Failures are never cached as empty successes.
 */
export async function fetchPublishedHomepage(): Promise<PublishedHomepageResult> {
  let payload: unknown
  try {
    payload = await request<unknown>('/catalog/homepage', {
      cache: 'no-store',
      signal: AbortSignal.timeout(HOMEPAGE_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    return classifyRequestError(error)
  }

  const envelope = readHomepageEnvelope(payload)
  if (!envelope) {
    console.error(
      '[storefront:homepage] Invalid homepage response envelope',
    )
    return { status: 'unavailable', reason: 'invalid' }
  }

  if (envelope.version === null) {
    if (envelope.sections.length > 0) {
      console.error(
        '[storefront:homepage] Unpublished homepage returned sections; ignoring them',
      )
    }
    return { status: 'empty' }
  }

  return { status: 'published', homepage: envelope }
}

function classifyRequestError(error: unknown): PublishedHomepageResult {
  if (error instanceof ApiError) {
    console.error(
      `[storefront:homepage] Homepage request failed status=${error.status}`,
    )
    return {
      status: 'unavailable',
      reason: 'http',
      httpStatus: error.status,
    }
  }

  if (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  ) {
    console.error('[storefront:homepage] Homepage request timed out')
    return { status: 'unavailable', reason: 'timeout' }
  }

  console.error('[storefront:homepage] Homepage request failed')
  return { status: 'unavailable', reason: 'network' }
}

function readHomepageEnvelope(
  value: unknown,
): PublishedHomepageDto | null {
  if (!isRecord(value)) {
    return null
  }
  const { version, schemaVersion, publishedAt, sections } = value
  const validVersion = version === null || isInteger(version)
  const validSchema = schemaVersion === null || isInteger(schemaVersion)
  const validPublishedAt =
    publishedAt === null || typeof publishedAt === 'string'
  if (!validVersion || !validSchema || !validPublishedAt || !Array.isArray(sections)) {
    return null
  }
  return {
    version: version as number | null,
    schemaVersion: schemaVersion as number | null,
    publishedAt: publishedAt as string | null,
    sections,
  } as PublishedHomepageDto
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
