import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MerchMediaDetailDto,
  MerchMediaListResponse,
  MerchMediaSummaryDto,
  MerchMediaUsageDto,
} from '@sabz/types';
import { randomUUID } from 'crypto';
import { rm, stat } from 'fs/promises';
import type { Readable } from 'stream';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MEDIA_HEADER_READ_BYTES } from '../../products/media-validation';
import {
  extensionForMediaMime,
  isImageMime,
  sanitizeMediaDisplayName,
  validateMediaFile,
} from '../../products/media-validation';
import { readFileHeader } from '../../products/media-file';
import { MediaProcessingService } from '../../products/media-processing/media-processing.service';
import {
  MediaNotFoundError,
  PRODUCT_MEDIA_STORAGE,
  ProductMediaStorage,
} from '../../products/storage/product-media-storage';
import { PRODUCT_MEDIA_TEMP_DIR } from '../../products/products.module';
import { ListMerchMediaQueryDto } from './dto/list-merch-media-query.dto';
import { UploadMerchMediaDto } from './dto/upload-merch-media.dto';
import {
  lockMediaLifecycle,
  snapshotReferencesMedia,
} from './media-lifecycle';
import { parseMerchMediaUpdateBody } from './media-update-input';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MEDIA_ENTITY = 'MerchMedia';
const MERCH_STORAGE_PREFIX = 'merchandising';

type MediaRow = Prisma.MerchMediaGetPayload<Record<string, never>>;

/**
 * Authenticated merchandising media library (Task 05.2).
 *
 * Storage and processing stay in the existing Product media infrastructure;
 * this service only owns merchandising metadata, publication eligibility, and
 * deletion safety. Binary delivery is always through a controller (admin or
 * publication-gated public), never a storage URL.
 */
@Injectable()
export class MerchMediaService {
  private readonly logger = new Logger(MerchMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(PRODUCT_MEDIA_STORAGE)
    private readonly storage: ProductMediaStorage,
    private readonly mediaProcessing: MediaProcessingService,
    @Inject(PRODUCT_MEDIA_TEMP_DIR)
    private readonly tempDir: string,
  ) {}

  async upload(
    file: Express.Multer.File,
    dto: UploadMerchMediaDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchMediaSummaryDto> {
    if (!file?.path) {
      throw new BadRequestException('فایل الزامی است.');
    }

    let processed: {
      outputPath: string;
      sizeBytes: number;
      width?: number;
      height?: number;
      thumbnailPath?: string;
    } | null = null;
    let storedKey: string | null = null;
    let thumbnailStoredKey: string | null = null;

    try {
      const header = await readFileHeader(file.path, MEDIA_HEADER_READ_BYTES);
      const sizeBytes = (await stat(file.path)).size;
      const detectedMime = validateMediaFile(
        file.mimetype,
        header,
        sizeBytes,
      );
      if (!isImageMime(detectedMime)) {
        throw new BadRequestException(
          'رسانه کمپین فقط می‌تواند تصویر JPG، PNG یا WEBP باشد.',
        );
      }

      const mediaId = randomUUID();
      const extension = extensionForMediaMime(detectedMime);
      const storageKey = `${MERCH_STORAGE_PREFIX}/${mediaId}.${extension}`;
      const thumbnailKey = `${MERCH_STORAGE_PREFIX}/${mediaId}.thumb.webp`;
      const originalName = sanitizeMediaDisplayName(file.originalname);

      // Editorial/campaign artwork is processed without the product-image
      // watermark. Product media keeps its default watermarked profile.
      processed = await this.mediaProcessing.process(
        file.path,
        detectedMime,
        this.tempDir,
        { watermark: false },
      );

      await this.storage.putFile(storageKey, processed.outputPath);
      storedKey = storageKey;

      if (processed.thumbnailPath !== undefined) {
        await this.storage.putFile(thumbnailKey, processed.thumbnailPath);
        thumbnailStoredKey = thumbnailKey;
      }

      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.merchMedia.create({
          data: {
            id: mediaId,
            originalName,
            mimeType: detectedMime,
            sizeBytes: processed?.sizeBytes ?? sizeBytes,
            storageKey,
            thumbnailKey: thumbnailStoredKey,
            width: processed?.width ?? null,
            height: processed?.height ?? null,
            altFa: dto.altFa?.trim() || null,
            // Publication eligibility is set exclusively by the future
            // publication activation service, never by upload/campaign attach.
            publishedAt: null,
            createdBy: actorId,
          },
        });
        await this.auditService.log(
          {
            userId: actorId,
            action: 'MERCH_MEDIA_UPLOADED',
            entity: MEDIA_ENTITY,
            entityId: row.id,
            before: null,
            after: {
              originalName: row.originalName,
              mimeType: row.mimeType,
              sizeBytes: row.sizeBytes,
              width: row.width,
              height: row.height,
              publishedAt: null,
            },
            ipAddress,
          },
          tx,
        );
        return row;
      });

      return this.toSummary(created);
    } catch (error) {
      for (const key of [storedKey, thumbnailStoredKey]) {
        if (key === null) {
          continue;
        }
        try {
          await this.storage.delete(key);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up merchandising media ${key}: ${
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError)
            }`,
          );
        }
      }
      throw error;
    } finally {
      const paths = new Set<string>(
        [
          file.path,
          processed?.outputPath ?? file.path,
          processed?.thumbnailPath ?? null,
        ].filter((path): path is string => path !== null),
      );
      for (const path of paths) {
        try {
          await rm(path, { force: true });
        } catch (cleanupError) {
          this.logger.warn(
            `Failed to remove merchandising temp file ${path}: ${
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError)
            }`,
          );
        }
      }
    }
  }

  async list(query: ListMerchMediaQueryDto): Promise<MerchMediaListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.MerchMediaWhereInput = {
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { originalName: { contains: query.q, mode: 'insensitive' } },
              { altFa: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.isPublished === true
        ? { publishedAt: { not: null } }
        : query.isPublished === false
          ? { publishedAt: null }
          : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.merchMedia.count({ where }),
      this.prisma.merchMedia.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  async getDetail(mediaId: string): Promise<MerchMediaDetailDto> {
    const row = await this.findActive(mediaId);
    return this.toDetail(row);
  }

  /**
   * Metadata-only update. `body` is intentionally raw so unknown/server
   * controlled fields can be rejected instead of silently whitelisted away.
   */
  async update(
    mediaId: string,
    body: unknown,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchMediaSummaryDto> {
    const parsed = parseMerchMediaUpdateBody(body);
    const updated = await this.prisma.$transaction(async (tx) => {
      // The media lock serializes metadata edits with soft-delete so a deleted
      // row cannot be updated or audited after the delete commits.
      await lockMediaLifecycle(tx);
      const existing = await this.findActive(mediaId, tx);
      if (!Object.prototype.hasOwnProperty.call(parsed, 'altFa')) {
        return existing;
      }
      const row = await tx.merchMedia.update({
        where: { id: mediaId },
        data: { altFa: parsed.altFa ?? null, updatedBy: actorId },
      });
      await this.auditService.log(
        {
          userId: actorId,
          action: 'MERCH_MEDIA_UPDATED',
          entity: MEDIA_ENTITY,
          entityId: mediaId,
          before: { altFa: existing.altFa },
          after: { altFa: row.altFa },
          ipAddress,
        },
        tx,
      );
      return row;
    });

    return this.toSummary(updated);
  }

  /**
   * Soft-delete with publication/campaign reference protection. The binary is
   * intentionally retained for historical snapshot integrity; physical
   * cleanup belongs to a later retention task.
   */
  async remove(
    mediaId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<MerchMediaSummaryDto> {
    const removed = await this.prisma.$transaction(async (tx) => {
      // See lifecycle-locks.ts: media deletion takes the media lock in the
      // same transaction that checks campaign/publication references.
      await lockMediaLifecycle(tx);

      const row = await tx.merchMedia.findFirst({
        where: { id: mediaId, deletedAt: null },
      });
      if (!row) {
        throw new NotFoundException('رسانه یافت نشد.');
      }

      // Existing retention policy: any campaign assignment, including one on an
      // archived campaign, blocks soft deletion. Archived campaigns cannot be
      // edited, so media used by an archived campaign remains in the library
      // until a separate retention/detach policy is introduced. This is
      // intentionally unchanged here.
      const campaignUsage = await tx.merchCampaignMedia.findMany({
        where: { mediaId },
        select: { campaign: { select: { id: true, internalName: true } } },
      });
      if (campaignUsage.length > 0) {
        throw new ConflictException(
          'این رسانه به کمپین وابسته است؛ ابتدا آن را از کمپین‌ها حذف کنید و تغییرات را منتشر کنید.',
        );
      }

      const publications = await tx.homepagePublication.findMany({
        where: { status: { in: ['PUBLISHED', 'SCHEDULED'] } },
        select: { id: true, version: true, status: true, sections: true },
      });
      const blocking = publications.filter((publication) =>
        snapshotReferencesMedia(publication.sections, mediaId),
      );
      if (blocking.length > 0) {
        const labels = blocking
          .map(
            (publication) =>
              `${publication.status === 'PUBLISHED' ? 'منتشرشده' : 'زمان‌بندی‌شده'} (نسخه ${publication.version})`,
          )
          .join('، ');
        throw new ConflictException(
          `این رسانه در صفحه اصلی ${labels} استفاده شده است؛ حذف آن مجاز نیست.`,
        );
      }

      const updated = await tx.merchMedia.update({
        where: { id: mediaId },
        data: { deletedAt: new Date(), updatedBy: actorId },
      });

      await this.auditService.log(
        {
          userId: actorId,
          action: 'MERCH_MEDIA_DELETED',
          entity: MEDIA_ENTITY,
          entityId: mediaId,
          before: {
            originalName: row.originalName,
            publishedAt: row.publishedAt?.toISOString() ?? null,
          },
          after: {
            deletedAt: updated.deletedAt?.toISOString() ?? null,
            binaryRetained: true,
          },
          ipAddress,
        },
        tx,
      );

      return updated;
    });

    return this.toSummary(removed);
  }

  async getAdminStream(
    mediaId: string,
  ): Promise<{ stream: Readable; mimeType: string; sizeBytes: number }> {
    const row = await this.findActive(mediaId);
    return this.openStream(row.storageKey, row.mimeType, row.sizeBytes);
  }

  async getAdminThumbnail(mediaId: string): Promise<{ stream: Readable }> {
    const row = await this.findActive(mediaId);
    if (row.thumbnailKey === null) {
      throw new NotFoundException('تصویر بندانگشتی یافت نشد.');
    }
    const stream = await this.openStreamKey(row.thumbnailKey);
    return { stream };
  }

  /** Public delivery is allowed only after Task 05.6 sets `publishedAt`. */
  async getPublicStream(
    mediaId: string,
  ): Promise<{ stream: Readable; mimeType: string; sizeBytes: number }> {
    const row = await this.prisma.merchMedia.findFirst({
      where: { id: mediaId, deletedAt: null, publishedAt: { not: null } },
      select: {
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
      },
    });
    if (!row) {
      throw new NotFoundException('رسانه یافت نشد.');
    }
    return this.openStream(row.storageKey, row.mimeType, row.sizeBytes);
  }

  async getPublicThumbnail(mediaId: string): Promise<{ stream: Readable }> {
    const row = await this.prisma.merchMedia.findFirst({
      where: {
        id: mediaId,
        deletedAt: null,
        publishedAt: { not: null },
        thumbnailKey: { not: null },
      },
      select: { thumbnailKey: true },
    });
    if (!row || row.thumbnailKey === null) {
      throw new NotFoundException('رسانه یافت نشد.');
    }
    const stream = await this.openStreamKey(row.thumbnailKey);
    return { stream };
  }

  private async findActive(
    mediaId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<MediaRow> {
    const row = await client.merchMedia.findFirst({
      where: { id: mediaId, deletedAt: null },
    });
    if (!row) {
      throw new NotFoundException('رسانه یافت نشد.');
    }
    return row;
  }

  private async openStream(
    storageKey: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<{ stream: Readable; mimeType: string; sizeBytes: number }> {
    const stream = await this.openStreamKey(storageKey);
    return { stream, mimeType, sizeBytes };
  }

  private async openStreamKey(storageKey: string): Promise<Readable> {
    try {
      return await this.storage.getStream(storageKey);
    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw new NotFoundException('رسانه یافت نشد.');
      }
      throw error;
    }
  }

  private toSummary(row: MediaRow): MerchMediaSummaryDto {
    return {
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      width: row.width,
      height: row.height,
      altFa: row.altFa,
      status: row.publishedAt === null ? 'DRAFT' : 'PUBLISHED',
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDetail(row: MediaRow): Promise<MerchMediaDetailDto> {
    const [campaignRows, publications] = await Promise.all([
      this.prisma.merchCampaignMedia.findMany({
        where: { mediaId: row.id },
        select: {
          campaign: {
            select: { id: true, internalName: true, archivedAt: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.homepagePublication.findMany({
        where: { status: { in: ['PUBLISHED', 'SCHEDULED'] } },
        select: { id: true, version: true, status: true, sections: true },
      }),
    ]);

    const usage: MerchMediaUsageDto = {
      campaigns: campaignRows.map((usage) => ({
        id: usage.campaign.id,
        internalName: usage.campaign.internalName,
        archivedAt: usage.campaign.archivedAt?.toISOString() ?? null,
      })),
      currentPublications: [],
      scheduledPublications: [],
    };
    for (const publication of publications) {
      if (!snapshotReferencesMedia(publication.sections, row.id)) {
        continue;
      }
      const entry = {
        id: publication.id,
        version: publication.version,
        status: publication.status as 'PUBLISHED' | 'SCHEDULED',
      };
      if (publication.status === 'PUBLISHED') {
        usage.currentPublications.push(entry);
      } else {
        usage.scheduledPublications.push(entry);
      }
    }

    return {
      ...this.toSummary(row),
      deletedAt: row.deletedAt?.toISOString() ?? null,
      usage,
    };
  }
}
