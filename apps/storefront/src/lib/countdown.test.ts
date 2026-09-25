import { describe, expect, it } from 'vitest';
import { computeCountdownParts } from './countdown';

// Fixed "now": 2026-09-25T12:00:00.000Z
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0, 0);

describe('computeCountdownParts', () => {
  it('splits a remainder into days/hours/minutes/seconds', () => {
    const endsAt = new Date(NOW + ((2 * 86_400 + 5 * 3600 + 7 * 60 + 9) * 1000));
    expect(computeCountdownParts(endsAt, NOW)).toEqual({
      days: 2,
      hours: 5,
      minutes: 7,
      seconds: 9,
      expired: false,
    });
  });

  it('reports the exact second at boundary crossings', () => {
    const endsAt = new Date(NOW + 3661_000);
    expect(computeCountdownParts(endsAt, NOW)).toEqual({
      days: 0,
      hours: 1,
      minutes: 1,
      seconds: 1,
      expired: false,
    });
  });

  it('clamps a past target to zero and marks it expired', () => {
    const endsAt = new Date(NOW - 5_000);
    const parts = computeCountdownParts(endsAt, NOW);
    expect(parts).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true });
  });

  it('treats the exact end instant as expired', () => {
    const endsAt = new Date(NOW);
    expect(computeCountdownParts(endsAt, NOW).expired).toBe(true);
  });

  it('treats an unparseable target as expired, never NaN', () => {
    expect(computeCountdownParts('not-a-date', NOW)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    });
  });

  it('accepts ms-epoch numbers and Date objects like strings', () => {
    const endsAt = new Date(NOW + 60_000);
    expect(computeCountdownParts(endsAt.getTime(), NOW).minutes).toBe(1);
    expect(computeCountdownParts(endsAt, NOW).minutes).toBe(1);
  });
});
