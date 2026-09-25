/**
 * Pure countdown math (SS-221). Calendar-agnostic: a sale window is a plain
 * millisecond remainder split into days/hours/minutes/seconds — no timezone
 * or DST semantics, because the UI counts down to a timestamp, not a date.
 * Consumed by the `CountdownTimer` primitive; kept pure so it is testable
 * without fake timers.
 */

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** True when the window has passed (or the input was unparseable). */
  expired: boolean;
}

/**
 * Remaining time until `endsAt`, measured at `now` (ms epoch). Negative or
 * unparseable targets clamp to zero and report `expired` — a stale window
 * must never render negative numbers.
 */
export function computeCountdownParts(
  endsAt: string | number | Date,
  now: number = Date.now(),
): CountdownParts {
  const end = new Date(endsAt).getTime();
  const remainingMs = Number.isFinite(end) ? Math.max(0, end - now) : 0;
  const totalSeconds = Math.floor(remainingMs / 1000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: totalSeconds <= 0,
  };
}
