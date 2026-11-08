import type { AppRole } from '../auth/roles';
import type { UserStatus } from '../auth/user';

/** Safe personal National ID summary; never contains the full value. */
export interface PersonalNationalIdSummary {
  hasNationalId: boolean;
  maskedNationalId: string | null;
}

export interface ProfileResponse extends PersonalNationalIdSummary {
  id: string;
  mobile: string;
  email: string | null;
  status: UserStatus;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  avatarUrl: string | null;
  roles: AppRole[];
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  address?: string;
  nationalId?: string;
}
