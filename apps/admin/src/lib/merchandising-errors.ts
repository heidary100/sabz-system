import { ApiError } from '../services/api'
import { translateApiError } from './error-messages'

/**
 * Structured merchandising API error (SS-273).
 *
 * The shared `ApiErrorPayload` type only declares statusCode/message/error, but
 * campaign, media, draft, and publication endpoints add validation issues,
 * warnings, usage, and optimistic-revision details. This parser preserves those
 * extras without widening the global API-client contract or dropping them.
 */
export interface MerchandisingErrorDetails {
  status: number
  /** First payload message, when one is available. */
  message: string | null
  /** Every payload message; NestJS validation returns an array. */
  messages: string[]
  /** Stable backend error code, e.g. HOMEPAGE_DRAFT_REVISION_CONFLICT. */
  errorCode: string | null
  errors: unknown[]
  warnings: unknown[]
  usage?: unknown
  currentRevision?: number
  currentSchemaVersion?: number
  currentUpdatedAt?: string | null
  /** Original payload object, untouched for callers that need other fields. */
  payload: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function toMessages(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value]
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  return []
}

/**
 * Returns null for non-ApiError failures (network errors, programmer errors)
 * so callers can keep a single unexpected-failure path.
 */
export function parseMerchandisingError(
  error: unknown,
): MerchandisingErrorDetails | null {
  if (!(error instanceof ApiError)) {
    return null
  }

  const payload = asRecord(error.payload) ?? {}
  const messages = toMessages(payload.message)
  const details: MerchandisingErrorDetails = {
    status: error.status,
    message: messages[0] ?? null,
    messages,
    errorCode: typeof payload.error === 'string' ? payload.error : null,
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    payload,
  }

  if ('usage' in payload) {
    details.usage = payload.usage
  }
  if (typeof payload.currentRevision === 'number') {
    details.currentRevision = payload.currentRevision
  }
  if (typeof payload.currentSchemaVersion === 'number') {
    details.currentSchemaVersion = payload.currentSchemaVersion
  }
  if ('currentUpdatedAt' in payload) {
    details.currentUpdatedAt =
      typeof payload.currentUpdatedAt === 'string'
        ? payload.currentUpdatedAt
        : null
  }

  return details
}

/** Structured API messages first, shared Persian translator second. */
export function merchandisingErrorMessage(error: unknown): string {
  const details = parseMerchandisingError(error)
  if (details?.messages.length) {
    return details.messages.join('، ')
  }
  return translateApiError(error)
}
