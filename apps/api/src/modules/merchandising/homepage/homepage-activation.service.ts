import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { HomepageSnapshot, HomepageSnapshotSection } from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { lockHomepagePublicationSources } from '../lifecycle-locks';
import { collectVisibleMediaIds } from '../media/media-lifecycle';
import { reconcilePublishedMediaEligibility } from './homepage-media-eligibility';
import { HomepageSourceService } from './homepage-source.service';

export const HOMEPAGE_ACTIVATION_SYSTEM_ACTOR = 'system:homepage-activation';
export const HOMEPAGE_ACTIVATION_DEFAULT_BATCH_SIZE = 10;

const PUBLICATION_ENTITY = 'HomepagePublication';

export type HomepageActivationOutcome = 'activated' | 'blocked' | 'skipped';

export interface HomepageActivationResult {
  publicationId: string;
  version: number;
  outcome: HomepageActivationOutcome;
  reason?: string;
  previousPublicationId?: string | null;
}

export interface HomepageActivationRunResult {
  due: number;
  activated: number;
  blocked: number;
  skipped: number;
  failed: number;
  hasMore: boolean;
}

interface ActivationSnapshotResult {
  snapshot: HomepageSnapshot | null;
  codes: string[];
}

/**
 * Scheduled homepage publication activation (Task 05.6).
 *
 * Due rows are activated in deterministic ascending publishAt/version order.
 * Each activation acquires campaign-then-media lifecycle locks, locks the
 * scheduled row, validates frozen dependencies, supersedes the current
 * publication, transitions the scheduled row, reconciles media eligibility, and
 * writes the audit event in one transaction.
 *
 * Permanent dependency failures use the existing terminal CANCELLED status so
 * they are not retried forever; transient failures leave the row SCHEDULED and
 * remain retryable on the next worker tick.
 */
@Injectable()
export class HomepageActivationService {
  private readonly logger = new Logger(HomepageActivationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly source: HomepageSourceService,
  ) {}

  async runDue(
    now = new Date(),
    limit = HOMEPAGE_ACTIVATION_DEFAULT_BATCH_SIZE,
  ): Promise<HomepageActivationRunResult> {
    const requested =
      Number.isFinite(limit) ? Math.floor(limit) : HOMEPAGE_ACTIVATION_DEFAULT_BATCH_SIZE;
    const batchSize = Math.max(1, Math.min(100, requested));
    const rows = await this.prisma.homepagePublication.findMany({
      where: {
        status: 'SCHEDULED',
        publishAt: { lte: now },
      },
      orderBy: [{ publishAt: 'asc' }, { version: 'asc' }, { id: 'asc' }],
      take: batchSize + 1,
      select: { id: true },
    });
    const batch = rows.slice(0, batchSize);
    const result: HomepageActivationRunResult = {
      due: batch.length,
      activated: 0,
      blocked: 0,
      skipped: 0,
      failed: 0,
      hasMore: rows.length > batchSize,
    };

    for (const row of batch) {
      try {
        const activation = await this.activateById(row.id, { now });
        if (activation.outcome === 'activated') result.activated += 1;
        else if (activation.outcome === 'blocked') result.blocked += 1;
        else result.skipped += 1;
      } catch {
        // activateById already logged and audited the transient failure.
        result.failed += 1;
      }
    }

    return result;
  }

  async activateById(
    id: string,
    options: { now?: Date; actorId?: string } = {},
  ): Promise<HomepageActivationResult> {
    const attemptedAt = options.now ?? new Date();
    const actorId = options.actorId ?? HOMEPAGE_ACTIVATION_SYSTEM_ACTOR;
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Established cross-domain order: campaign lifecycle, then media.
        await lockHomepagePublicationSources(tx);
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "HomepagePublication" WHERE "id" = $1 FOR UPDATE',
          id,
        );
        const row = await tx.homepagePublication.findUnique({ where: { id } });
        if (!row) {
          return {
            publicationId: id,
            version: 0,
            outcome: 'skipped' as const,
            reason: 'NOT_FOUND',
          };
        }
        if (row.status !== 'SCHEDULED') {
          return {
            publicationId: row.id,
            version: row.version,
            outcome: 'skipped' as const,
            reason: `STATUS_${row.status}`,
          };
        }
        if (row.publishAt === null || row.publishAt.getTime() > attemptedAt.getTime()) {
          return {
            publicationId: row.id,
            version: row.version,
            outcome: 'skipped' as const,
            reason: 'NOT_DUE',
          };
        }

        // A newer publication (higher version) already current means an older
        // due schedule must not replace it. Use the existing terminal state.
        const current = await tx.homepagePublication.findFirst({
          where: { status: 'PUBLISHED' },
          select: { id: true, version: true },
        });
        if (current && current.version > row.version) {
          return this.block(
            tx,
            row,
            current,
            attemptedAt,
            actorId,
            'NEWER_PUBLICATION_ACTIVE',
          );
        }

        const snapshotResult = readStoredSnapshot(row.sections, row.schemaVersion);
        const dependency = await this.validateDependencies(
          tx,
          snapshotResult,
          row.schemaVersion,
          attemptedAt,
        );
        if (dependency.codes.length > 0) {
          return this.block(
            tx,
            row,
            current,
            attemptedAt,
            actorId,
            dependency.structural ? 'SNAPSHOT_INVALID' : 'DEPENDENCIES_INVALID',
            dependency.codes,
          );
        }
        const snapshot = snapshotResult.snapshot;
        if (!snapshot) {
          return this.block(
            tx,
            row,
            current,
            attemptedAt,
            actorId,
            'SNAPSHOT_INVALID',
            ['SNAPSHOT_MISSING'],
          );
        }

        const activatedAt = new Date();
        if (current) {
          const superseded = await tx.homepagePublication.updateMany({
            where: { id: current.id, status: 'PUBLISHED' },
            data: { status: 'SUPERSEDED' },
          });
          if (superseded.count !== 1) {
            throw new ActivationConflictError(
              'Current publication changed during scheduled activation.',
            );
          }
        }

        const activated = await tx.homepagePublication.updateMany({
          where: { id: row.id, status: 'SCHEDULED' },
          data: {
            status: 'PUBLISHED',
            publishAt: null,
            publishedAt: activatedAt,
            publishedBy: actorId,
          },
        });
        if (activated.count !== 1) {
          throw new ActivationConflictError(
            'Scheduled publication changed during activation.',
          );
        }

        await reconcilePublishedMediaEligibility(
          tx,
          snapshot,
          activatedAt,
          actorId,
        );
        await this.audit.log(
          {
            userId: actorId,
            action: 'HOMEPAGE_SCHEDULED_ACTIVATED',
            entity: PUBLICATION_ENTITY,
            entityId: row.id,
            before: {
              status: 'SCHEDULED',
              version: row.version,
              scheduledAt: row.publishAt.toISOString(),
              previousPublicationId: current?.id ?? null,
              previousVersion: current?.version ?? null,
            },
            after: {
              status: 'PUBLISHED',
              version: row.version,
              activatedAt: activatedAt.toISOString(),
              mediaCount: collectVisibleMediaIds(snapshot).size,
            },
            ipAddress: undefined,
          },
          tx,
        );
        this.logger.log(
          `Activated scheduled homepage publication id=${row.id} version=${row.version}${
            current ? ` previous=${current.id}@v${current.version}` : ''
          }`,
        );
        return {
          publicationId: row.id,
          version: row.version,
          outcome: 'activated' as const,
          previousPublicationId: current?.id ?? null,
        };
      });
    } catch (error) {
      await this.auditTransientFailure(id, attemptedAt, actorId, error);
      this.logger.error(
        `Scheduled homepage activation failed id=${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw error;
    }
  }

  /**
   * Activation and rollback share the same snapshot eligibility validator.
   * This prevents a campaign from being valid for one lifecycle decision and
   * invalid for the other. The validator also enforces an active campaign
   * window, unlike draft validation which may warn before a campaign starts.
   */
  private async validateDependencies(
    tx: Prisma.TransactionClient,
    snapshotResult: ActivationSnapshotResult,
    rowSchemaVersion: number,
    now: Date,
  ): Promise<{ codes: string[]; structural: boolean }> {
    const { snapshot, codes } = snapshotResult;
    if (!snapshot) {
      return {
        codes: codes.length > 0 ? codes : ['SNAPSHOT_MISSING'],
        structural: true,
      };
    }

    if (snapshot.schemaVersion !== rowSchemaVersion) {
      codes.push('SNAPSHOT_SCHEMA_MISMATCH');
    }

    const validation = await this.source.validateSnapshot(tx, snapshot, now);
    const structural = validation.errors.some(
      (error) => error.category === 'STRUCTURAL',
    );
    if (structural) {
      codes.push('SNAPSHOT_STRUCTURE_INVALID');
    }
    for (const error of validation.errors) {
      codes.push(activationDependencyCode(error.code));
    }

    return { codes: [...new Set(codes)], structural };
  }

  private async block(
    tx: Prisma.TransactionClient,
    row: {
      id: string;
      version: number;
      publishAt: Date | null;
    },
    current: { id: string; version: number } | null,
    attemptedAt: Date,
    actorId: string,
    code: string,
    detailCodes: string[] = [],
  ): Promise<HomepageActivationResult> {
    const cancelled = await tx.homepagePublication.updateMany({
      where: { id: row.id, status: 'SCHEDULED' },
      data: { status: 'CANCELLED' },
    });
    if (cancelled.count !== 1) {
      throw new ActivationConflictError(
        'Scheduled publication changed while blocking activation.',
      );
    }
    await this.audit.log(
      {
        userId: actorId,
        action: 'HOMEPAGE_SCHEDULED_ACTIVATION_BLOCKED',
        entity: PUBLICATION_ENTITY,
        entityId: row.id,
        before: {
          status: 'SCHEDULED',
          version: row.version,
          scheduledAt: row.publishAt?.toISOString() ?? null,
          previousPublicationId: current?.id ?? null,
        },
        after: {
          status: 'CANCELLED',
          version: row.version,
          attemptedAt: attemptedAt.toISOString(),
          code,
          dependencyCodes: detailCodes,
        },
      },
      tx,
    );
    this.logger.warn(
      `Blocked scheduled homepage publication id=${row.id} version=${row.version} code=${code}${
        detailCodes.length > 0 ? ` dependencies=${detailCodes.join(',')}` : ''
      }`,
    );
    return {
      publicationId: row.id,
      version: row.version,
      outcome: 'blocked',
      reason: code,
      previousPublicationId: current?.id ?? null,
    };
  }

  private async auditTransientFailure(
    id: string,
    attemptedAt: Date,
    actorId: string,
    error: unknown,
  ): Promise<void> {
    try {
      const row = await this.prisma.homepagePublication.findUnique({
        where: { id },
        select: { version: true, publishAt: true, status: true },
      });
      await this.audit.log({
        userId: actorId,
        action: 'HOMEPAGE_SCHEDULED_ACTIVATION_FAILED',
        entity: PUBLICATION_ENTITY,
        entityId: id,
        before: null,
        after: {
          version: row?.version ?? null,
          scheduledAt: row?.publishAt?.toISOString() ?? null,
          attemptedAt: attemptedAt.toISOString(),
          status: row?.status ?? null,
          errorCode: activationErrorCode(error),
          message:
            error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
        },
      });
    } catch (auditError) {
      this.logger.warn(
        `Failed to audit scheduled activation failure id=${id}: ${
          auditError instanceof Error ? auditError.message : String(auditError)
        }`,
      );
    }
  }
}

class ActivationConflictError extends Error {}

function activationErrorCode(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code;
  }
  if (error instanceof ActivationConflictError) {
    return 'ACTIVATION_CONFLICT';
  }
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}

function readStoredSnapshot(
  value: Prisma.JsonValue,
  schemaVersion: number,
): ActivationSnapshotResult {
  if (Array.isArray(value)) {
    return {
      snapshot: {
        schemaVersion,
        sections: value as unknown as HomepageSnapshotSection[],
      },
      codes: [],
    };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.sections)) {
      return { snapshot: null, codes: ['SNAPSHOT_SECTIONS_MISSING'] };
    }
    if (
      record.schemaVersion !== undefined &&
      typeof record.schemaVersion !== 'number'
    ) {
      return { snapshot: null, codes: ['SNAPSHOT_SCHEMA_INVALID'] };
    }
    return {
      snapshot: {
        schemaVersion:
          typeof record.schemaVersion === 'number'
            ? record.schemaVersion
            : schemaVersion,
        sections: record.sections as unknown as HomepageSnapshotSection[],
      },
      codes: [],
    };
  }
  return { snapshot: null, codes: ['SNAPSHOT_MISSING'] };
}

function activationDependencyCode(code: string): string {
  switch (code) {
    case 'MISSING_MEDIA':
      return 'MEDIA_MISSING';
    case 'MEDIA_INELIGIBLE':
      return 'MEDIA_DELETED';
    default:
      return code;
  }
}
