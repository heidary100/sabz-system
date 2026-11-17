import type { MerchMediaUsageDto } from '@sabz/types'
import { translateApiError } from './error-messages'
import { parseMerchandisingError } from './merchandising-errors'

/** Mirrors the API's default image limit (env-configurable server-side). */
export const MERCH_MEDIA_MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
export const MERCH_MEDIA_ALT_MAX_LENGTH = 160

export const MERCH_MEDIA_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export function validateMerchMediaFile(file: File): string | null {
  if (file.size > MERCH_MEDIA_MAX_IMAGE_SIZE_BYTES) {
    return 'حجم تصویر باید حداکثر ۱۰ مگابایت باشد.'
  }
  if (file.type !== '' && !MERCH_MEDIA_ALLOWED_MIME_TYPES.has(file.type)) {
    return 'فرمت فایل پشتیبانی نمی‌شود. فقط JPG، PNG و WEBP مجاز است.'
  }
  return null
}

export function formatMerchMediaDimensions(
  width: number | null,
  height: number | null,
): string {
  return width !== null && height !== null ? `${width}×${height}` : '—'
}

/**
 * Returns true only when the backend actually returned usage arrays. A missing
 * or malformed usage field is unknown, not evidence that the asset is unused.
 */
export function isMerchMediaUsageKnown(
  usage: unknown,
): usage is MerchMediaUsageDto {
  if (typeof usage !== 'object' || usage === null) {
    return false
  }
  const value = usage as Record<string, unknown>
  return (
    Array.isArray(value.campaigns) &&
    Array.isArray(value.currentPublications) &&
    Array.isArray(value.scheduledPublications)
  )
}

export function hasMerchMediaUsage(
  usage: MerchMediaUsageDto | null | undefined,
): boolean {
  return Boolean(
    usage &&
      (usage.campaigns.length > 0 ||
        usage.currentPublications.length > 0 ||
        usage.scheduledPublications.length > 0),
  )
}

/** Structured-error first, then the shared translator fallback. */
export function merchMediaErrorMessage(error: unknown): string {
  const details = parseMerchandisingError(error)
  if (details?.messages.length) {
    return details.messages.join('، ')
  }
  return translateApiError(error)
}
