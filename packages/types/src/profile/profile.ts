import type { AppRole } from '../auth/roles';
import type { UserStatus } from '../auth/user';

export interface ProfileResponse {
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
}
