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
 * Commerce report block (SS-240F). Read-only aggregations over the order,
 * RFQ, review and blog domains for dashboard v2. Money stays Rial verbatim
 * (Decimal strings); the admin formats via `formatRial`, the storefront
 * alone converts to Toman.
 */
export interface DashboardOrdersByStatus {
  pending: number;
  processing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
}

export interface DashboardPaymentSplit {
  cod: number;
  online: number;
  /** Integer 0–100, 0 when there are no orders. Computed server-side. */
  codSharePct: number;
}

export interface DashboardDayPoint {
  /** UTC calendar day `YYYY-MM-DD`. */
  date: string;
  orders: number;
  /** Rial (Decimal string) of PAID orders created that day. */
  revenueRial: string;
}

export interface DashboardCommerce {
  ordersByStatus: DashboardOrdersByStatus;
  totalOrders: number;
  /** Rial (Decimal string): sum(total) where paymentStatus = PAID. */
  paidRevenueRial: string;
  payments: DashboardPaymentSplit;
  pendingRfqs: number;
  pendingReviews: number;
  draftPosts: number;
  /** Oldest-first, last 14 UTC days including today. */
  ordersByDay: DashboardDayPoint[];
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
  commerce: DashboardCommerce;
  recentPartners: AdminPartnerListItem[];
  recentAudit: DashboardRecentAudit[];
}