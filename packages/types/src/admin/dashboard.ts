import type { AdminPartnerListItem } from '../partner/admin';
import type { AuditActor } from './audit';

/**
 * Admin dashboard contracts (SS-065).
 *
 * The dashboard is a read-only operational snapshot of existing domains. It
 * intentionally exposes counts and compact recent lists only; it is not an
 * analytics subsystem.
 */
export interface DashboardUserCounts {
  total: number;
  active: number;
  suspended: number;
  locked: number;
  pendingOtp: number;
}

export interface DashboardRoleCounts {
  customer: number;
  partner: number;
  operator: number;
  admin: number;
}

export interface DashboardPartnerCounts {
  draft: number;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Compact recent audit entry for the dashboard. Deliberately a subset of
 * `AuditEntry`: the `before`/`after` payload blobs and `ipAddress` are not
 * surfaced on the dashboard.
 */
export interface DashboardRecentAudit {
  id: string;
  userId: string | null;
  actor: AuditActor | null;
  action: string;
  entity: string;
  entityId: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  users: DashboardUserCounts;
  roles: DashboardRoleCounts;
  partners: DashboardPartnerCounts;
  recentPartners: AdminPartnerListItem[];
  recentAudit: DashboardRecentAudit[];
}