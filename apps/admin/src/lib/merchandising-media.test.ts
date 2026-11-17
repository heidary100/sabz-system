import { describe, expect, it } from 'vitest'
import { ApiError } from '../services/api'
import {
  MERCH_MEDIA_MAX_IMAGE_SIZE_BYTES,
  formatMerchMediaDimensions,
  hasMerchMediaUsage,
  isMerchMediaUsageKnown,
  merchMediaErrorMessage,
  validateMerchMediaFile,
} from './merchandising-media'

function fakeFile(overrides: Partial<File>): File {
  return {
    name: 'hero.png',
    type: 'image/png',
    size: 1024,
    ...overrides,
  } as File
}

describe('merchandising media helpers (SS-274)', () => {
  it('accepts only supported image types and bounded sizes', () => {
    expect(validateMerchMediaFile(fakeFile({ type: 'image/png' }))).toBeNull()
    expect(validateMerchMediaFile(fakeFile({ type: 'image/webp' }))).toBeNull()
    expect(validateMerchMediaFile(fakeFile({ type: 'image/gif' }))).toContain(
      'فقط JPG، PNG و WEBP',
    )
    expect(
      validateMerchMediaFile(
        fakeFile({ size: MERCH_MEDIA_MAX_IMAGE_SIZE_BYTES + 1 }),
      ),
    ).toContain('حداکثر ۱۰ مگابایت')
  })

  it('formats dimensions without inventing missing values', () => {
    expect(formatMerchMediaDimensions(1200, 800)).toBe('1200×800')
    expect(formatMerchMediaDimensions(null, 800)).toBe('—')
    expect(formatMerchMediaDimensions(1200, null)).toBe('—')
  })

  it('distinguishes known-empty usage from unknown usage', () => {
    const empty = {
      campaigns: [],
      currentPublications: [],
      scheduledPublications: [],
    }
    expect(isMerchMediaUsageKnown(empty)).toBe(true)
    expect(hasMerchMediaUsage(empty)).toBe(false)
    expect(isMerchMediaUsageKnown({ campaigns: [] })).toBe(false)
    expect(isMerchMediaUsageKnown(undefined)).toBe(false)
    expect(hasMerchMediaUsage(undefined)).toBe(false)
  })

  it('prefers structured API messages and falls back for unknown errors', () => {
    const conflict = new ApiError(409, {
      statusCode: 409,
      error: 'Conflict',
      message: 'این رسانه به کمپین وابسته است.',
    })
    expect(merchMediaErrorMessage(conflict)).toBe(
      'این رسانه به کمپین وابسته است.',
    )
    expect(merchMediaErrorMessage(new Error('network'))).toBe(
      'خطایی رخ داد. دوباره تلاش کنید.',
    )
  })
})
