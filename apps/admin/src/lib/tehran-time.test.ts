import { afterEach, describe, expect, it } from 'vitest'
import {
  BUSINESS_TIME_ZONE,
  currentTehranDateTimeInput,
  formatTehranDate,
  formatTehranDateTime,
  isFutureTehranDateTime,
  parseTehranDateTimeInput,
  tehranDateTimeInputToUtcIso,
  utcIsoToTehranDateTimeInput,
} from './tehran-time'

const originalTimeZone = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTimeZone
})

describe('Asia/Tehran timezone utility (SS-280)', () => {
  it('uses the approved IANA zone', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Tehran')
  })

  it('converts a Tehran wall time to UTC using the actual zone offset', () => {
    expect(tehranDateTimeInputToUtcIso('2026-11-10T12:00')).toBe(
      '2026-11-10T08:30:00.000Z',
    )
    expect(tehranDateTimeInputToUtcIso('2026-11-10T00:00')).toBe(
      '2026-11-09T20:30:00.000Z',
    )
    expect(tehranDateTimeInputToUtcIso('2026-11-10T23:59')).toBe(
      '2026-11-10T20:29:00.000Z',
    )
  })

  it('converts UTC back to Tehran wall time for inputs', () => {
    expect(utcIsoToTehranDateTimeInput('2026-11-10T08:30:00.000Z')).toBe(
      '2026-11-10T12:00',
    )
    expect(utcIsoToTehranDateTimeInput('2026-11-09T20:30:00.000Z')).toBe(
      '2026-11-10T00:00',
    )
  })

  it.each(['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/London'])(
    'is independent of the browser/process timezone (%s)',
    (timeZone) => {
      process.env.TZ = timeZone
      expect(tehranDateTimeInputToUtcIso('2026-11-10T12:00')).toBe(
        '2026-11-10T08:30:00.000Z',
      )
      expect(utcIsoToTehranDateTimeInput('2026-11-10T08:30:00.000Z')).toBe(
        '2026-11-10T12:00',
      )
    },
  )

  it('rejects empty, malformed, and impossible wall times', () => {
    expect(parseTehranDateTimeInput('')).toBeNull()
    expect(tehranDateTimeInputToUtcIso('')).toBeNull()
    expect(tehranDateTimeInputToUtcIso('not-a-date')).toBeNull()
    expect(tehranDateTimeInputToUtcIso('2026-02-30T10:00')).toBeNull()
    expect(tehranDateTimeInputToUtcIso('2026-04-31T10:00')).toBeNull()
    expect(tehranDateTimeInputToUtcIso('2026-11-10T24:00')).toBeNull()
    expect(tehranDateTimeInputToUtcIso('2026-11-10T10:61')).toBeNull()
    expect(utcIsoToTehranDateTimeInput('')).toBe('')
    expect(utcIsoToTehranDateTimeInput('invalid')).toBe('')
  })

  it('accepts seconds precision and round-trips it', () => {
    expect(tehranDateTimeInputToUtcIso('2026-11-10T12:00:45')).toBe(
      '2026-11-10T08:30:45.000Z',
    )
  })

  it('formats displayed timestamps explicitly in Tehran time', () => {
    expect(formatTehranDateTime('2026-11-10T08:30:00.000Z')).toContain(
      '۱۴۰۵/۰۸/۱۹',
    )
    expect(formatTehranDateTime('2026-11-10T08:30:00.000Z')).toContain(
      'به وقت تهران',
    )
    expect(formatTehranDate('2026-11-10T08:30:00.000Z')).toContain(
      'به وقت تهران',
    )
    expect(formatTehranDateTime(null)).toBe('—')
    expect(formatTehranDateTime('invalid')).toBe('زمان نامعتبر')
  })

  it('enforces future times and produces a current Tehran input value', () => {
    const now = Date.parse('2026-11-10T08:00:00.000Z')
    expect(isFutureTehranDateTime('2026-11-10T12:00', now)).toBe(true)
    expect(isFutureTehranDateTime('2026-11-10T11:00', now)).toBe(false)
    expect(isFutureTehranDateTime('invalid', now)).toBe(false)
    expect(currentTehranDateTimeInput(now)).toBe('2026-11-10T11:30')
  })
})
