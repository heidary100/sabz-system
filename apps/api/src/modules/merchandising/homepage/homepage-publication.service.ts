import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type HomepagePublicationDto,
  type HomepagePublicationListResponse,
  type HomepagePublicationSummaryDto,
  type HomepageSnapshot,
  type HomepageSnapshotSection,
} from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { collectVisibleMediaIds } from '../media/media-lifecycle';
import { lockHomepagePublicationSources } from '../lifecycle-locks';
import { ListHomepagePublicationsQueryDto } from './dto';
import { HomepageDraftService } from './homepage-draft.service';
import { reconcilePublishedMediaEligibility } from './homepage-media-eligibility';
import {
  throwPublicationInputError,
  validateCreatePublicationBody,
  validateRollbackPublicationBody,
} from './homepage-publication-input';
import { HomepageSourceService } from './homepage-source.service';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const PUBLICATION_ENTITY = 'HomepagePublication';

type PublicationRow = Prisma.HomepagePublicationGetPayload<Record<string, never>>;

/**
 * Homepage draft publication API (Task 05.4).
 *
 * Immediate publication and rollback activate media eligibility. Scheduled
 * publication only freezes a snapshot; Task 05.6 owns time-based activation and
 * must reuse the same lifecycle locks and media eligibility transaction.
 */
@Injectable()
export class HomepagePublicationService {
  private readonly logger = new Logger(HomepagePublicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly draftService: HomepageDraftService,
    private readonly source: HomepageSourceService,
  ) {}

  async list(
    query: ListHomepagePublicationsQueryDto,
  ): Promise<HomepagePublicationListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.HomepagePublicationWhereInput = query.status
      ? { status: query.status }
      : {};
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.homepagePublication.count({ where }),
      this.prisma.homepagePublication.findMany({
        where,
        orderBy: [{ version: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((row) => this.toSummary(row)),
      total,
      page,
      limit,
    };
  }

  async getDetail(id: string): Promise<HomepagePublicationDto> {
    const row = await this.prisma.homepagePublication.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('نسخه انتشار یافت نشد.');
    }
    return this.toDetail(row);
  }

  async publish(
    actorId: string,
    body: unknown,
    ipAddress?: string,
  ): Promise<HomepagePublicationDto> {
    const parsed = validateCreatePublicationBody(body);
    if (!parsed.result.valid || !parsed.value) throwPublicationInputError(parsed.result);
    const requestedPublishAt =
      parsed.value.publishAt !== null ? new Date(parsed.value.publishAt) : null;
    if (requestedPublishAt && requestedPublishAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        error: 'HOMEPAGE_PUBLISH_AT_MUST_BE_FUTURE',
        message: 'زمان انتشار زمان‌بندی‌شده باید در آینده باشد.',
      });
    }

    let publicationId: string;
    try {
      publicationId = await this.prisma.$transaction(async (tx) => {
        await lockHomepagePublicationSources(tx);
        const draft = await this.draftService.lockCurrentDraft(tx, actorId, ipAddress);
        const now = new Date();
        // Immediate publication is a current-lifecycle decision. Scheduled
        // publication creation may still be prepared ahead of a campaign window;
        // activation re-checks current eligibility at the scheduled instant.
        const built = await this.source.buildSnapshot(tx, draft.sections, {
          now,
          windowPolicy: requestedPublishAt
            ? 'allow-future-start'
            : 'require-active-window',
        });
        if (!built.snapshot || built.errors.length > 0) {
          throw new BadRequestException({
            error: 'HOMEPAGE_DRAFT_INVALID',
            message: built.errors.map((error) => error.message),
            errors: built.errors,
            warnings: built.warnings,
          });
        }
        if (requestedPublishAt && requestedPublishAt.getTime() <= now.getTime()) {
          throw new BadRequestException({
            error: 'HOMEPAGE_PUBLISH_AT_MUST_BE_FUTURE',
            message: 'زمان انتشار زمان‌بندی‌شده باید در آینده باشد.',
          });
        }
        const version = await this.nextVersion(tx);
        const snapshot = built.snapshot;
        const mediaCount = collectVisibleMediaIds(snapshot).size;

        if (requestedPublishAt) {
          const row = await tx.homepagePublication.create({
            data: {
              version,
              status: 'SCHEDULED',
              publishAt: requestedPublishAt,
              publishedAt: null,
              sections: snapshot as unknown as Prisma.InputJsonValue,
              schemaVersion: snapshot.schemaVersion,
              sourceDraftRevision: draft.revision,
              note: parsed.value!.note,
              createdBy: actorId,
            },
          });
          await this.audit.log(
            {
              userId: actorId,
              action: 'HOMEPAGE_PUBLICATION_SCHEDULED',
              entity: PUBLICATION_ENTITY,
              entityId: row.id,
              before: null,
              after: {
                version,
                publishAt: requestedPublishAt.toISOString(),
                sourceDraftRevision: draft.revision,
                mediaCount,
              },
              ipAddress,
            },
            tx,
          );
          return row.id;
        }

        const superseded = await tx.homepagePublication.findMany({
          where: { status: 'PUBLISHED' },
          select: { id: true, version: true },
        });
        if (superseded.length > 0) {
          await tx.homepagePublication.updateMany({
            where: { id: { in: superseded.map((row) => row.id) } },
            data: { status: 'SUPERSEDED' },
          });
        }
        const row = await tx.homepagePublication.create({
          data: {
            version,
            status: 'PUBLISHED',
            publishAt: null,
            publishedAt: now,
            sections: snapshot as unknown as Prisma.InputJsonValue,
            schemaVersion: snapshot.schemaVersion,
            sourceDraftRevision: draft.revision,
            note: parsed.value!.note,
            createdBy: actorId,
            publishedBy: actorId,
          },
        });
        await reconcilePublishedMediaEligibility(tx, snapshot, now, actorId);
        await this.audit.log(
          {
            userId: actorId,
            action: 'HOMEPAGE_PUBLICATION_PUBLISHED',
            entity: PUBLICATION_ENTITY,
            entityId: row.id,
            before:
              superseded.length > 0
                ? { publicationIds: superseded.map((item) => item.id) }
                : null,
            after: {
              version,
              sourceDraftRevision: draft.revision,
              supersededVersions: superseded.map((item) => item.version),
              mediaCount,
            },
            ipAddress,
          },
          tx,
        );
        return row.id;
      });
    } catch (error) {
      await this.safeAuditFailure(
        actorId,
        'HOMEPAGE_PUBLICATION_FAILED',
        'homepage',
        error,
        ipAddress,
      );
      throw error;
    }
    // Response hydration is deliberately outside the mutation error boundary:
    // a read failure after commit must not create a false FAILED audit.
    return this.getDetail(publicationId);
  }

  async cancel(
    id: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<HomepagePublicationDto> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.homepagePublication.findUnique({ where: { id } });
        if (!row) {
          throw new NotFoundException('نسخه انتشار یافت نشد.');
        }
        if (row.status === 'CANCELLED') {
          return;
        }
        if (row.status !== 'SCHEDULED') {
          throw new ConflictException({
            error: 'HOMEPAGE_PUBLICATION_NOT_CANCELLABLE',
            message: 'فقط انتشار زمان‌بندی‌شده قابل لغو است.',
            currentStatus: row.status,
          });
        }
        const changed = await tx.homepagePublication.updateMany({
          where: { id, status: 'SCHEDULED' },
          data: { status: 'CANCELLED' },
        });
        if (changed.count === 0) {
          const current = await tx.homepagePublication.findUnique({ where: { id } });
          if (current?.status === 'CANCELLED') return;
          throw new ConflictException({
            error: 'HOMEPAGE_PUBLICATION_NOT_CANCELLABLE',
            message: 'وضعیت انتشار تغییر کرده است و قابل لغو نیست.',
            currentStatus: current?.status ?? null,
          });
        }
        await this.audit.log(
          {
            userId: actorId,
            action: 'HOMEPAGE_PUBLICATION_CANCELLED',
            entity: PUBLICATION_ENTITY,
            entityId: id,
            before: { status: 'SCHEDULED', version: row.version },
            after: { status: 'CANCELLED', version: row.version },
            ipAddress,
          },
          tx,
        );
      });
    } catch (error) {
      await this.safeAuditFailure(
        actorId,
        'HOMEPAGE_SCHEDULE_CANCEL_FAILED',
        id,
        error,
        ipAddress,
      );
      throw error;
    }
    return this.getDetail(id);
  }

  async rollback(
    id: string,
    actorId: string,
    body: unknown,
    ipAddress?: string,
  ): Promise<HomepagePublicationDto> {
    const parsed = validateRollbackPublicationBody(body);
    if (!parsed.result.valid || !parsed.value) throwPublicationInputError(parsed.result);
    let publicationId: string;
    try {
      publicationId = await this.prisma.$transaction(async (tx) => {
        await lockHomepagePublicationSources(tx);
        const now = new Date();
        const source = await tx.homepagePublication.findUnique({ where: { id } });
        if (!source) {
          throw new NotFoundException('نسخه انتشار مبدأ یافت نشد.');
        }
        if (source.status === 'PUBLISHED') {
          throw new ConflictException({
            error: 'HOMEPAGE_ROLLBACK_TARGET_CURRENT',
            message: 'بازگردانی به نسخه‌ای که همین حالا منتشرشده است مجاز نیست.',
            currentPublicationId: source.id,
          });
        }
        if (source.status !== 'SUPERSEDED') {
          throw new ConflictException({
            error: 'HOMEPAGE_ROLLBACK_TARGET_INVALID',
            message: 'فقط نسخه‌های تاریخی منتشرشده قابل بازگردانی هستند.',
            currentStatus: source.status,
          });
        }
        const snapshot = readStoredSnapshot(source.sections, source.schemaVersion);
        const validation = await this.source.validateSnapshot(tx, snapshot, now);
        if (validation.errors.length > 0) {
          throw new ConflictException({
            error: 'HOMEPAGE_ROLLBACK_INVALID',
            message: 'محتوای این نسخه با وضعیت فعلی کاتالوگ یا رسانه سازگار نیست.',
            errors: validation.errors,
            warnings: validation.warnings,
          });
        }

        const version = await this.nextVersion(tx);
        const superseded = await tx.homepagePublication.findMany({
          where: { status: 'PUBLISHED' },
          select: { id: true, version: true },
        });
        if (superseded.length > 0) {
          await tx.homepagePublication.updateMany({
            where: { id: { in: superseded.map((row) => row.id) } },
            data: { status: 'SUPERSEDED' },
          });
        }
        const row = await tx.homepagePublication.create({
          data: {
            version,
            status: 'PUBLISHED',
            publishAt: null,
            publishedAt: now,
            sections: snapshot as unknown as Prisma.InputJsonValue,
            schemaVersion: snapshot.schemaVersion,
            sourceDraftRevision: source.sourceDraftRevision,
            rollbackFromPublicationId: source.id,
            note: parsed.value!.note ?? `بازگردانی از نسخه ${source.version}`,
            createdBy: actorId,
            publishedBy: actorId,
          },
        });
        await reconcilePublishedMediaEligibility(tx, snapshot, now, actorId);
        await this.audit.log(
          {
            userId: actorId,
            action: 'HOMEPAGE_ROLLBACK_CREATED',
            entity: PUBLICATION_ENTITY,
            entityId: row.id,
            before: {
              sourcePublicationId: source.id,
              sourceVersion: source.version,
              currentPublicationIds: superseded.map((item) => item.id),
            },
            after: {
              version,
              rollbackFromPublicationId: source.id,
              sourceDraftRevision: source.sourceDraftRevision,
            },
            ipAddress,
          },
          tx,
        );
        return row.id;
      });
    } catch (error) {
      await this.safeAuditFailure(
        actorId,
        'HOMEPAGE_ROLLBACK_FAILED',
        id,
        error,
        ipAddress,
      );
      throw error;
    }
    return this.getDetail(publicationId);
  }

  private async nextVersion(tx: Prisma.TransactionClient): Promise<number> {
    const aggregate = await tx.homepagePublication.aggregate({
      _max: { version: true },
    });
    return (aggregate._max.version ?? 0) + 1;
  }

  private toSummary(row: PublicationRow): HomepagePublicationSummaryDto {
    return {
      id: row.id,
      version: row.version,
      status: row.status,
      publishAt: row.publishAt?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      sourceDraftRevision: row.sourceDraftRevision,
      rollbackFromPublicationId: row.rollbackFromPublicationId,
      note: row.note,
      createdBy: row.createdBy,
      publishedBy: row.publishedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: PublicationRow): HomepagePublicationDto {
    const snapshot = readStoredSnapshot(row.sections, row.schemaVersion);
    return {
      ...this.toSummary(row),
      schemaVersion: snapshot.schemaVersion,
      sections: snapshot.sections,
    };
  }

  private async safeAuditFailure(
    actorId: string,
    action: string,
    entityId: string,
    error: unknown,
    ipAddress?: string,
  ): Promise<void> {
    try {
      await this.audit.log({
        userId: actorId,
        action,
        entity: PUBLICATION_ENTITY,
        entityId,
        before: null,
        after: {
          error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
          code: errorCode(error),
          status: errorStatus(error),
        },
        ipAddress,
      });
    } catch (auditError) {
      this.logger.warn(
        `Failed to audit ${action}: ${
          auditError instanceof Error ? auditError.message : String(auditError)
        }`,
      );
    }
  }
}

function readStoredSnapshot(
  value: Prisma.JsonValue,
  schemaVersion: number,
): HomepageSnapshot {
  if (Array.isArray(value)) {
    return {
      schemaVersion,
      sections: value as unknown as HomepageSnapshotSection[],
    };
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return {
      schemaVersion:
        typeof record.schemaVersion === 'number' ? record.schemaVersion : schemaVersion,
      sections: Array.isArray(record.sections)
        ? (record.sections as unknown as HomepageSnapshotSection[])
        : [],
    };
  }
  return { schemaVersion, sections: [] };
}

function errorStatus(error: unknown): number | null {
  return error instanceof HttpException ? error.getStatus() : null;
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null;
  const response = error.getResponse();
  if (typeof response === 'object' && response !== null && 'error' in response) {
    const code = (response as { error?: unknown }).error;
    return typeof code === 'string' ? code : null;
  }
  return null;
}
