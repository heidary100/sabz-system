import type { AppRole } from './roles';

export type UserStatus = 'PENDING_OTP' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';

export interface AuthUser {
  id: string;
  mobile: string;
  status: UserStatus;
  roles: AppRole[];
  /**
   * Display name for self-identity UI (admin header). Null/blank means the
   * consumer must fall back to `mobile`; the API never returns more profile
   * fields through this identity projection.
   */
  profile?: {
    firstName: string | null;
    lastName: string | null;
  } | null;
}

/** Name-first label with a phone fallback (shared admin identity rule). */
export function authUserDisplayName(
  user: Pick<AuthUser, 'mobile' | 'profile'> | null | undefined,
): string {
  if (!user) {
    return '';
  }
  const name = [user.profile?.firstName, user.profile?.lastName]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .trim();
  return name.length > 0 ? name : user.mobile;
}
