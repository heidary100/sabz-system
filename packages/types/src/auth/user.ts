import type { AppRole } from './roles';

export type UserStatus = 'PENDING_OTP' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED';

export interface AuthUser {
  id: string;
  mobile: string;
  status: UserStatus;
  roles: AppRole[];
}
