import type { AppRole } from '../auth/roles';
import type { UserStatus } from '../auth/user';
import type { PartnerStatus } from '../partner/partner';

export interface AdminUserProfileSummary {
  firstName: string;
  lastName: string;
}

export interface AdminUserRoleSummary {
  name: AppRole;
  assignedAt: string;
}

export interface AdminPartnerSummary {
  id: string;
  businessName: string;
  approvalStatus: PartnerStatus;
}

export interface AdminUserSummary {
  id: string;
  mobile: string;
  status: UserStatus;
  profile: AdminUserProfileSummary | null;
  roles: AppRole[];
  partner: AdminPartnerSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDetail {
  id: string;
  mobile: string;
  email: string | null;
  status: UserStatus;
  profile: AdminUserProfileSummary | null;
  roles: AdminUserRoleSummary[];
  partner: AdminPartnerSummary | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
  role?: AppRole;
}

export interface UserStatusChangeInput {
  reason?: string;
}