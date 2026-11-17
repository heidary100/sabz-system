import { describe, expect, it } from 'vitest'
import { ApiError } from '../services/api'
import { parseMerchandisingError } from './merchandising-errors'

describe('parseMerchandisingError (SS-273)', () => {
  it('preserves draft revision conflict details', () => {
    const error = new ApiError(409, {
      statusCode: 409,
      error: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
      message: 'پیش‌نویس توسط کاربر دیگری تغییر کرده است.',
      currentRevision: 7,
      currentSchemaVersion: 1,
      currentUpdatedAt: '2026-11-09T10:00:00.000Z',
    } as never)

    const details = parseMerchandisingError(error)

    expect(details).toMatchObject({
      status: 409,
      errorCode: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
      message: 'پیش‌نویس توسط کاربر دیگری تغییر کرده است.',
      currentRevision: 7,
      currentSchemaVersion: 1,
      currentUpdatedAt: '2026-11-09T10:00:00.000Z',
    })
    expect(details?.messages).toEqual([
      'پیش‌نویس توسط کاربر دیگری تغییر کرده است.',
    ])
  })

  it('preserves validation errors, warnings, and usage', () => {
    const usage = { currentPublications: [{ id: 'p1' }], scheduledPublications: [] }
    const error = new ApiError(400, {
      statusCode: 400,
      error: 'HOMEPAGE_DRAFT_INVALID',
      message: ['بخش اول نامعتبر است.', 'بخش دوم هشدار دارد.'],
      errors: [{ path: 'sections[0]', code: 'INVALID_STRING' }],
      warnings: [{ path: 'sections[1]', code: 'HERO_MOBILE_MEDIA_MISSING' }],
      usage,
    } as never)

    const details = parseMerchandisingError(error)

    expect(details?.messages).toEqual([
      'بخش اول نامعتبر است.',
      'بخش دوم هشدار دارد.',
    ])
    expect(details?.errors).toEqual([
      { path: 'sections[0]', code: 'INVALID_STRING' },
    ])
    expect(details?.warnings).toEqual([
      { path: 'sections[1]', code: 'HERO_MOBILE_MEDIA_MISSING' },
    ])
    expect(details?.usage).toEqual(usage)
  })

  it('preserves an explicit null currentUpdatedAt', () => {
    const error = new ApiError(409, {
      statusCode: 409,
      error: 'HOMEPAGE_DRAFT_SCHEMA_UNSUPPORTED',
      message: 'نسخه ساختار پشتیبانی نمی‌شود.',
      currentSchemaVersion: 2,
      currentUpdatedAt: null,
    } as never)

    expect(parseMerchandisingError(error)?.currentUpdatedAt).toBeNull()
  })

  it('returns a safe shape for ordinary 403 responses', () => {
    const error = new ApiError(403, {
      statusCode: 403,
      error: 'Forbidden',
      message: 'Forbidden resource',
    })

    const details = parseMerchandisingError(error)

    expect(details).toMatchObject({
      status: 403,
      message: 'Forbidden resource',
      errorCode: 'Forbidden',
      errors: [],
      warnings: [],
    })
    expect(details).not.toHaveProperty('usage')
    expect(details).not.toHaveProperty('currentRevision')
  })

  it('returns null for non-API failures', () => {
    expect(parseMerchandisingError(new Error('network down'))).toBeNull()
    expect(parseMerchandisingError(null)).toBeNull()
  })
})
