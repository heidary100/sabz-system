import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MERCH_HOMEPAGE_DRAFT_ID,
  MERCH_HOMEPAGE_SCHEMA_VERSION,
  type HomepageDraftDto,
  type HomepageDraftSection,
  type HomepageDraftValidationResult,
  type HomepageValidationIssue,
} from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import {
  throwDraftInputError,
  validateDraftValidationBody,
  validateDraftWriteBody,
} from './homepage-draft-input';
import { HomepageSourceService } from './homepage-source.service';

const DRAFT_ENTITY = 'HomepageDraft';

type DraftRow = Prisma.HomepageDraftGetPayload<Record<string, never>>;

export interface LockedHomepageDraft {
  revision: number;
  schemaVersion: number;
  sections: HomepageDraftSection[];
}

/**
 * Singleton homepage draft API (Task 05.4).
 *
 * Draft rows are working state only. Publication snapshots are created by
 * HomepagePublicationService and are never derived at public-read time from
 * this table.
 */
@Injectable()
export class HomepageDraftService {
  private readonly logger = new Logger(HomepageDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly source: HomepageSourceService,
  ) {}

  async getDraft(actorId: string, ipAddress?: string): Promise<HomepageDraftDto> {
    const row = await this.prisma.$transaction((tx) =>
      this.ensureDraft(tx, actorId, ipAddress),
    );
    return this.toDto(row);
  }

  async replaceDraft(
    actorId: string,
    body: unknown,
    ipAddress?: string,
  ): Promise<HomepageDraftDto> {
    const parsed = validateDraftWriteBody(body);
    if (!parsed.result.valid || !parsed.value) throwDraftInputError(parsed.result);
    const sections = parsed.value.sections as HomepageDraftSection[];

    // Fail stale writes before doing expensive relational work, while still
    // re-checking under the row lock inside the transaction below.
    const existing = await this.prisma.homepageDraft.findUnique({
      where: { id: MERCH_HOMEPAGE_DRAFT_ID },
      select: { revision: true, schemaVersion: true, updatedAt: true },
    });
    const currentRevision = existing?.revision ?? 0;
    if (existing && existing.schemaVersion !== MERCH_HOMEPAGE_SCHEMA_VERSION) {
      throw new ConflictException({
        error: 'HOMEPAGE_DRAFT_SCHEMA_UNSUPPORTED',
        message: 'نسخه ساختار پیش‌نویس با نسخه پشتیبانی‌شده سازگار نیست.',
        currentSchemaVersion: existing.schemaVersion,
        supportedSchemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
      });
    }
    if (parsed.value.revision !== currentRevision) {
      throw new ConflictException({
        error: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
        message: 'پیش‌نویس توسط کاربر دیگری تغییر کرده است؛ نسخه فعلی را دوباره بخوانید.',
        currentRevision,
        currentSchemaVersion: existing?.schemaVersion ?? MERCH_HOMEPAGE_SCHEMA_VERSION,
        currentUpdatedAt: existing?.updatedAt.toISOString() ?? null,
      });
    }

    const built = await this.source.buildSnapshot(this.prisma, sections);
    if (built.errors.length > 0 || !built.snapshot) {
      await this.auditValidationFailure(
        actorId,
        'HOMEPAGE_DRAFT_VALIDATION_FAILED',
        built.errors,
        ipAddress,
      );
      throw new BadRequestException({
        error: 'HOMEPAGE_DRAFT_INVALID',
        message: built.errors.map((error) => error.message),
        errors: built.errors,
        warnings: built.warnings,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.ensureDraft(tx, actorId, ipAddress);
      await this.lockDraftRow(tx);
      const current = await tx.homepageDraft.findUniqueOrThrow({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
      });
      if (current.schemaVersion !== MERCH_HOMEPAGE_SCHEMA_VERSION) {
        throw new ConflictException({
          error: 'HOMEPAGE_DRAFT_SCHEMA_UNSUPPORTED',
          message: 'نسخه ساختار پیش‌نویس با نسخه پشتیبانی‌شده سازگار نیست.',
          currentSchemaVersion: current.schemaVersion,
          supportedSchemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
        });
      }
      if (current.revision !== parsed.value!.revision) {
        throw new ConflictException({
          error: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
          message: 'پیش‌نویس توسط کاربر دیگری تغییر کرده است؛ نسخه فعلی را دوباره بخوانید.',
          currentRevision: current.revision,
          currentSchemaVersion: current.schemaVersion,
          currentUpdatedAt: current.updatedAt.toISOString(),
        });
      }

      const row = await tx.homepageDraft.update({
        where: { id: MERCH_HOMEPAGE_DRAFT_ID },
        data: {
          revision: { increment: 1 },
          schemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
          sections: sections as unknown as Prisma.InputJsonValue,
          updatedBy: actorId,
        },
      });
      await this.audit.log(
        {
          userId: actorId,
          action: 'HOMEPAGE_DRAFT_UPDATED',
          entity: DRAFT_ENTITY,
          entityId: MERCH_HOMEPAGE_DRAFT_ID,
          before: {
            revision: current.revision,
            sectionCount: countSections(current.sections),
          },
          after: {
            revision: row.revision,
            sectionCount: sections.length,
            sectionKeys: sections.map((section) => section.key),
          },
          ipAddress,
        },
        tx,
      );
      return row;
    });

    return this.toDto(updated);
  }

  async validateDraft(
    actorId: string,
    body: unknown,
    ipAddress?: string,
  ): Promise<HomepageDraftValidationResult> {
    const parsed = validateDraftValidationBody(body);
    if (!parsed.result.valid) throwDraftInputError(parsed.result);

    const current = await this.prisma.$transaction((tx) =>
      this.ensureDraft(tx, actorId, ipAddress),
    );
    if (
      parsed.value.revision !== undefined &&
      parsed.value.revision !== current.revision
    ) {
      throw new ConflictException({
        error: 'HOMEPAGE_DRAFT_REVISION_CONFLICT',
        message: 'نسخه پیش‌نویس ارسال‌شده با نسخه فعلی مطابقت ندارد.',
        currentRevision: current.revision,
        currentSchemaVersion: current.schemaVersion,
        currentUpdatedAt: current.updatedAt.toISOString(),
      });
    }

    const sections =
      parsed.value.sections !== undefined
        ? (parsed.value.sections as HomepageDraftSection[])
        : parseSections(current.sections);
    const built = await this.source.buildSnapshot(this.prisma, sections);
    return {
      revision: current.revision,
      schemaVersion: current.schemaVersion,
      valid: built.errors.length === 0,
      errors: built.errors,
      warnings: built.warnings,
    };
  }

  /**
   * Publication-only helper: ensure the singleton, lock its row, and return the
   * source data from one snapshot-consistent state. The caller must already hold
   * the homepage source locks.
   */
  async lockCurrentDraft(
    tx: Prisma.TransactionClient,
    actorId: string,
    ipAddress?: string,
  ): Promise<LockedHomepageDraft> {
    await this.ensureDraft(tx, actorId, ipAddress);
    await this.lockDraftRow(tx);
    const row = await tx.homepageDraft.findUniqueOrThrow({
      where: { id: MERCH_HOMEPAGE_DRAFT_ID },
    });
    if (row.schemaVersion !== MERCH_HOMEPAGE_SCHEMA_VERSION) {
      throw new ConflictException({
        error: 'HOMEPAGE_DRAFT_SCHEMA_UNSUPPORTED',
        message: 'نسخه ساختار پیش‌نویس با نسخه پشتیبانی‌شده سازگار نیست.',
        currentSchemaVersion: row.schemaVersion,
        supportedSchemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
      });
    }
    return {
      revision: row.revision,
      schemaVersion: row.schemaVersion,
      sections: parseSections(row.sections),
    };
  }

  private async ensureDraft(
    tx: Prisma.TransactionClient,
    actorId: string,
    ipAddress?: string,
  ): Promise<DraftRow> {
    const inserted = await tx.homepageDraft.createMany({
      data: [
        {
          id: MERCH_HOMEPAGE_DRAFT_ID,
          revision: 0,
          schemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
          sections: [] as Prisma.InputJsonValue,
          createdBy: actorId,
          updatedBy: actorId,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 1) {
      await this.audit.log(
        {
          userId: actorId,
          action: 'HOMEPAGE_DRAFT_CREATED',
          entity: DRAFT_ENTITY,
          entityId: MERCH_HOMEPAGE_DRAFT_ID,
          before: null,
          after: { revision: 0, schemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION },
          ipAddress,
        },
        tx,
      );
    }
    return tx.homepageDraft.findUniqueOrThrow({
      where: { id: MERCH_HOMEPAGE_DRAFT_ID },
    });
  }

  private async lockDraftRow(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "HomepageDraft" WHERE "id" = $1 FOR UPDATE',
      MERCH_HOMEPAGE_DRAFT_ID,
    );
  }

  private toDto(row: DraftRow): HomepageDraftDto {
    return {
      revision: row.revision,
      schemaVersion: row.schemaVersion,
      sections: parseSections(row.sections),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async auditValidationFailure(
    actorId: string,
    action: string,
    errors: HomepageValidationIssue[],
    ipAddress?: string,
  ): Promise<void> {
    try {
      await this.audit.log({
        userId: actorId,
        action,
        entity: DRAFT_ENTITY,
        entityId: MERCH_HOMEPAGE_DRAFT_ID,
        before: null,
        after: {
          errorCount: errors.length,
          codes: [...new Set(errors.map((error) => error.code))].slice(0, 20),
        },
        ipAddress,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to audit ${action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function parseSections(value: Prisma.JsonValue): HomepageDraftSection[] {
  if (!Array.isArray(value)) return [];
  return value as unknown as HomepageDraftSection[];
}

function countSections(value: Prisma.JsonValue): number {
  return Array.isArray(value) ? value.length : 0;
}
