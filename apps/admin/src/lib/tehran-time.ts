/**
 * Approved business timezone for campaign windows and homepage scheduling
 * (SS-280). All conversions are IANA-aware; no fixed +03:30 offset is encoded.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Tehran'
export const BUSINESS_TIME_ZONE_LABEL = 'Asia/Tehran'
export const TEHRAN_TIME_NOTE = 'به وقت تهران'

export interface TehranWallTime {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const WALL_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

const wallTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const displayDateTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const displayDateFormatter = new Intl.DateTimeFormat('fa-IR', {
  calendar: 'persian',
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts.find((part) => part.type === type)?.value
  return value === undefined ? Number.NaN : Number(value)
}

function wallTimeInTehran(date: Date): TehranWallTime {
  const parts = wallTimeFormatter.formatToParts(date)
  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    hour: readPart(parts, 'hour'),
    minute: readPart(parts, 'minute'),
    second: readPart(parts, 'second'),
  }
}

function sameWallTime(left: TehranWallTime, right: TehranWallTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  )
}

/**
 * Parses a `datetime-local` value as a Tehran wall-clock time. Invalid calendar
 * dates (e.g. 2026-02-30) and times are rejected rather than normalized.
 */
export function parseTehranDateTimeInput(
  value: string,
): TehranWallTime | null {
  const match = WALL_TIME_PATTERN.exec(value.trim())
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = match[6] === undefined ? 0 : Number(match[6])
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null
  }
  return { year, month, day, hour, minute, second }
}

/**
 * Converts a Tehran wall-clock `datetime-local` value to a UTC ISO timestamp.
 * The iterative offset lookup uses the zone's actual offset at the target
 * instant, so it does not assume a fixed offset.
 */
export function tehranDateTimeInputToUtcIso(value: string): string | null {
  const wall = parseTehranDateTimeInput(value)
  if (!wall) {
    return null
  }
  let guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  )
  const targetAsUtc = guess
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = wallTimeInTehran(new Date(guess))
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    )
    const difference = actualAsUtc - targetAsUtc
    if (difference === 0) {
      break
    }
    guess -= difference
  }
  const result = new Date(guess)
  if (Number.isNaN(result.getTime())) {
    return null
  }
  const roundTrip = wallTimeInTehran(result)
  if (!sameWallTime(roundTrip, wall)) {
    // A nonexistent/ambiguous wall time (e.g. a DST jump) is rejected rather
    // than silently reinterpreted.
    return null
  }
  return result.toISOString()
}

/** Converts a stored UTC ISO timestamp to a Tehran `datetime-local` value. */
export function utcIsoToTehranDateTimeInput(
  iso: string | null | undefined,
): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const wall = wallTimeInTehran(date)
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}`
}

/** Validates that an input value is a real Tehran wall time in the future. */
export function isFutureTehranDateTime(
  value: string,
  nowMs = Date.now(),
): boolean {
  const utcIso = tehranDateTimeInputToUtcIso(value)
  if (!utcIso) {
    return false
  }
  return Date.parse(utcIso) > nowMs
}

export function formatTehranDateTime(
  iso: string | null | undefined,
): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'زمان نامعتبر'
  }
  return `${displayDateTimeFormatter.format(date)} ${TEHRAN_TIME_NOTE}`
}

export function formatTehranDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return 'زمان نامعتبر'
  }
  return `${displayDateFormatter.format(date)} ${TEHRAN_TIME_NOTE}`
}

/** Current Tehran wall time, useful as a `min` for schedule inputs. */
export function currentTehranDateTimeInput(nowMs = Date.now()): string {
  return utcIsoToTehranDateTimeInput(new Date(nowMs).toISOString())
}
