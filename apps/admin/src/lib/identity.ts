import type { AuthUser } from '@sabz/types'

/**
 * Admin header identity rule: show a usable first/last name, otherwise fall
 * back to the phone number. Blank strings never count as a name.
 */
export function adminDisplayName(
  user: Pick<AuthUser, 'mobile' | 'profile'> | null | undefined,
): string {
  if (!user) {
    return ''
  }
  const name = [user.profile?.firstName, user.profile?.lastName]
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ')
  return name.length > 0 ? name : user.mobile
}

/** True when the displayed identity is a real name (not the phone fallback). */
export function hasDisplayName(
  user: Pick<AuthUser, 'mobile' | 'profile'> | null | undefined,
): boolean {
  return adminDisplayName(user) !== (user?.mobile ?? '')
}
