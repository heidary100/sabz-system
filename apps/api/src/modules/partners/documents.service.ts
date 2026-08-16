import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BusinessDocument, Partner, PartnerApprovalStatus, PartnerDocumentType, Prisma } from '@prisma/client';
import type { PartnerDocumentSummary } from '@sabz/types';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  extensionForMime,
  sanitizeDisplayName,
  validateDocumentFile,
} from './document-validation';
import {
  DOCUMENT_STORAGE,
  DocumentNotFoundError,
  DocumentStorage,
} from './storage/document-storage';

const EDITABLE_STATUSES: PartnerApprovalStatus[] = [
  PartnerApprovalStatus.DRAFT,
  PartnerApprovalStatus.REJECTED,
];

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}

  async upload(
    userId: string,
    type: PartnerDocumentType,
    file: Express.Multer.File,
    ipAddress?: string,
  ): Promise<PartnerDocumentSummary> {
    const detectedMime = validateDocumentFile(file.mimetype, file.buffer);

    const partner = await this.resolveOwnedPartner(userId);
    this.assertEditable(partner);

    const documentId = randomUUID();
    const extension = extensionForMime(detectedMime);
    const storageKey = `partners/${partner.id}/${documentId}.${extension}`;
    const originalName = sanitizeDisplayName(file.originalname, 'document');
    const sizeBytes = file.buffer.length;

    // Binary first: the database state is authoritative; if the DB write fails
    // afterwards the new binary is cleaned up best-effort below.
    await this.storage.put(storageKey, file.buffer);

    let replacedBinaryKey: string | null = null;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Re-assert the edit lock inside the transaction: a concurrent submit
        // (PATCH /application with submit: true) may have moved the application
        // to PENDING between the earlier status check and this write.
        await this.assertEditableInTransaction(tx, partner.id);

        // Discover the document to replace inside the transaction, so two
        // concurrent first uploads of the same type replace rather than
        // duplicate. Under a retry/double-submit the second request sees the
        // first request's committed row here and replaces it.
        const replaced = await tx.businessDocument.findFirst({
          where: { partnerId: partner.id, type, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });

        const document = await tx.businessDocument.create({
          data: {
            partnerId: partner.id,
            type,
            originalName,
            mimeType: detectedMime,
            sizeBytes,
            storageKey,
            createdBy: userId,
          },
        });

        if (replaced) {
          const removed = await tx.businessDocument.updateMany({
            where: { id: replaced.id, deletedAt: null },
            data: { deletedAt: new Date(), updatedBy: userId },
          });

          if (removed.count === 0) {
            // Another concurrent upload already replaced this document. Abort so
            // exactly one active document remains per type; the new binary is
            // cleaned up by the caller's catch block.
            throw new ConflictException(
              'سند قبلی در حال تعویض بود؛ دوباره تلاش کنید.',
            );
          }

          replacedBinaryKey = replaced.storageKey;

          await this.auditService.log(
            {
              userId,
              action: 'PARTNER_DOCUMENT_REMOVED',
              entity: 'BusinessDocument',
              entityId: replaced.id,
              after: { type },
              ipAddress,
            },
            tx,
          );
        }

        await this.auditService.log(
          {
            userId,
            action: 'PARTNER_DOCUMENT_UPLOADED',
            entity: 'BusinessDocument',
            entityId: document.id,
            after: {
              type: document.type,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
            },
            ipAddress,
          },
          tx,
        );

        return document;
      });

      if (replacedBinaryKey !== null) {
        // Post-commit cleanup of the replaced binary. Never roll back the
        // committed database state; log for the future reconciliation concern.
        try {
          await this.storage.delete(replacedBinaryKey);
        } catch (error) {
          this.logger.error(
            `Failed to remove replaced document binary ${replacedBinaryKey}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      return this.toSummary(created);
    } catch (error) {
      // The database write failed after the binary was persisted: best-effort
      // remove the orphaned binary so no file survives without a metadata row.
      try {
        await this.storage.delete(storageKey);
      } catch (cleanupError) {
        this.logger.error(
          `Failed to clean up orphaned document binary ${storageKey}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
      throw error;
    }
  }

  async list(userId: string): Promise<PartnerDocumentSummary[]> {
    const partner = await this.resolveOwnedPartner(userId);
    const documents = await this.prisma.businessDocument.findMany({
      where: { partnerId: partner.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return documents.map((document) => this.toSummary(document));
  }

  async getBinary(
    userId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; summary: PartnerDocumentSummary }> {
    const partner = await this.resolveOwnedPartner(userId);
    const document = await this.prisma.businessDocument.findFirst({
      where: { id: documentId, partnerId: partner.id, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundException('سند یافت نشد.');
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.get(document.storageKey);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) {
        throw new NotFoundException('سند یافت نشد.');
      }
      throw error;
    }

    return { buffer, summary: this.toSummary(document) };
  }

  async remove(userId: string, documentId: string, ipAddress?: string): Promise<void> {
    const partner = await this.resolveOwnedPartner(userId);
    this.assertEditable(partner);

    const document = await this.prisma.businessDocument.findFirst({
      where: { id: documentId, partnerId: partner.id, deletedAt: null },
    });
    if (!document) {
      throw new NotFoundException('سند یافت نشد.');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.assertEditableInTransaction(tx, partner.id);

      const removed = await tx.businessDocument.updateMany({
        where: { id: document.id, deletedAt: null },
        data: { deletedAt: new Date(), updatedBy: userId },
      });

      if (removed.count === 0) {
        throw new NotFoundException('سند یافت نشد.');
      }

      await this.auditService.log(
        {
          userId,
          action: 'PARTNER_DOCUMENT_REMOVED',
          entity: 'BusinessDocument',
          entityId: document.id,
          after: { type: document.type },
          ipAddress,
        },
        tx,
      );
    });

    // Post-commit binary removal; failures are logged, not rolled back.
    try {
      await this.storage.delete(document.storageKey);
    } catch (error) {
      this.logger.error(
        `Failed to remove document binary ${document.storageKey}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async resolveOwnedPartner(userId: string): Promise<Partner> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('درخواست همکاری یافت نشد.');
    }

    const partner = await this.prisma.partner.findUnique({
      where: { profileId: profile.id },
    });
    if (!partner || partner.deletedAt !== null) {
      throw new NotFoundException('درخواست همکاری یافت نشد.');
    }

    return partner;
  }

  private assertEditable(partner: Partner): void {
    const editable =
      partner.approvalStatus === PartnerApprovalStatus.DRAFT ||
      partner.approvalStatus === PartnerApprovalStatus.REJECTED;
    if (!editable) {
      throw new ConflictException(
        'در وضعیت فعلی امکان تغییر اسناد وجود ندارد.',
      );
    }
  }

  /**
   * Serializes document mutations per application and re-asserts the edit lock
   * inside the transaction. SELECT ... FOR UPDATE takes a row lock on the
   * Partner row that is held until commit, so:
   *
   * - a concurrent submit (whose UPDATE contends on the same row lock) cannot
   *   interleave with this write, and
   * - two concurrent first uploads of the same type serialize, so the second
   *   sees the first's committed document and replaces it instead of
   *   duplicating it.
   */
  private async assertEditableInTransaction(
    tx: Prisma.TransactionClient,
    partnerId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ approvalStatus: string; deletedAt: Date | null }>>`
      SELECT "approvalStatus", "deletedAt" FROM "Partner" WHERE "id" = ${partnerId} FOR UPDATE
    `;
    const row = rows[0];

    if (!row || row.deletedAt !== null) {
      throw new NotFoundException('درخواست همکاری یافت نشد.');
    }

    if (!EDITABLE_STATUSES.includes(row.approvalStatus as PartnerApprovalStatus)) {
      throw new ConflictException(
        'در وضعیت فعلی امکان تغییر اسناد وجود ندارد.',
      );
    }
  }

  private toSummary(document: BusinessDocument): PartnerDocumentSummary {
    return {
      id: document.id,
      type: document.type,
      originalName: document.originalName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      createdAt: document.createdAt.toISOString(),
    };
  }
}
