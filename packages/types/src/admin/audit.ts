/**
 * Admin-facing audit log contracts (SS-064).
 *
 * `before`/`after` are opaque audit payloads passed through exactly as
 * stored. Their safety is guaranteed at write time: every audit producer
 * excludes secrets (OTP codes, tokens and hashes, password hashes, national
 * IDs, business license numbers, storage keys and filesystem paths).
 */
export interface AuditActor {
  id: string;
  mobile: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AuditEntry {
  id: string;
  userId: string | null;
  actor: AuditActor | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditListQuery {
  page?: number;
  limit?: number;
  actorId?: string;
  action?: string;
  entity?: string;
  entityId?: string;
  from?: string;
  to?: string;
}
