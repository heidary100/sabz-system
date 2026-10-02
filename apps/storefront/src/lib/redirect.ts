/**
 * Safe post-login redirect target (SS-245 follow-up, #292).
 *
 * Authed routes send logged-out visitors to `/login?next=<path>`; after OTP
 * success the login page honors it. Only root-relative internal paths are
 * accepted — absolute URLs and protocol-relative forms (`//host`, `/\host`)
 * are open-redirect vectors and fall back to the default. No path allowlist
 * lives here; callers decide the fallback.
 */
export function resolveNextTarget(
  next: string | null | undefined,
  fallback = '/account',
): string {
  if (
    typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/\\')
  ) {
    return next;
  }
  return fallback;
}
