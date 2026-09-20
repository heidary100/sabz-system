import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import type { ProductMediaSummary } from '@sabz/types';
import { randomUUID } from 'crypto';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import type { Readable } from 'stream';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { readFileHeader } from './media-file';
import {
  extensionForMediaMime,
  MEDIA_HEADER_READ_BYTES,
  mediaTypeForMime,
  sanitizeMediaDisplayName,
  validateMediaFile,
} from './media-validation';
import {
  MediaNotFoundError,
  PRODUCT_MEDIA_STORAGE,
  ProductMediaStorage,
} from './storage/product-media-storage';
import { MediaProcessingService } from './media-processing/media-processing.service';
import { UploadMediaDto } from './dto';

const MEDIA_ENTITY = 'ProductMedia';
/** Temp uploads older than this are swept at startup. */
const TEMP_FILE_MAX_AGE_MS = 60 * 60 * 1000;

@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
    private readonly mediaProcessing: MediaProcessingService,
    @Inject('PRODUCT_MEDIA_TEMP_DIR') private readonly tempDir: string,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.sweepStaleTempFiles();
  }

  async list(productId: string): Promise<ProductMediaSummary[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, deletedAt: true },
    });
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }

    const rows = await this.prisma.productMedia.findMany({
      where: { productId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    });

    return rows.map((row) => this.toSummary(row));
  }

  /**
   * Uploads a single product image/video (SS-105). The storage key is
   * server-generated (`products/<productId>/<mediaId>.<ext>`) and never
   * derived from the client filename.
   *
   * Pipeline (uploads stream to a multer disk temp file, never memory):
   *   1. validate file (MIME + magic bytes + per-type size) from disk;
   *   2. resolve product/variant ownership and state;
   *   3. watermark/process the asset server-side (image: sharp, video: FFmpeg);
   *   4. move the processed asset into final storage;
   *   5. transactionally create metadata + primary/order state + audit;
   *   6. if the DB transaction fails, best-effort delete the orphaned binary.
   *
   * Only the processed (watermarked) asset is stored; originals are never
   * retained so an un-branded file cannot be served through any endpoint.
   */
  async upload(
    productId: string,
    file: Express.Multer.File,
    dto: UploadMediaDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<ProductMediaSummary> {
    if (!file.path) {
      throw new BadRequestException('فایل الزامی است.');
    }

    // Everything below must be inside the try/finally: any failure between
    // validation, processing and the DB write would otherwise leave the multer
    // temp file (up to 200 MB) behind until the startup sweep.
    let processed: {
      outputPath: string;
      sizeBytes: number;
      thumbnailPath?: string;
      thumbnailSizeBytes?: number;
    } | null = null;
    let storedKey: string | null = null;
    let thumbnailKey: string | null = null;
    try {
      const header = await readFileHeader(file.path, MEDIA_HEADER_READ_BYTES);
      const totalSizeBytes = (await stat(file.path)).size;
      const detectedMime = validateMediaFile(file.mimetype, header, totalSizeBytes);

      const mediaType = mediaTypeForMime(detectedMime);
      if (dto.mediaType !== undefined && dto.mediaType !== mediaType) {
        throw new ConflictException(
          'نوع رسانه اعلامشده با محتوای واقعی فایل مطابقت ندارد.',
        );
      }

      const mediaId = randomUUID();
      const extension = extensionForMediaMime(detectedMime);
      const storageKey = `products/${productId}/${mediaId}.${extension}`;
      const originalName = sanitizeMediaDisplayName(file.originalname);

      // Content hash over the received source bytes (SS-204, dedup). Always
      // server-computed so importer skip-checks and stored rows agree; it
      // identifies source bytes, not the watermarked derivative.
      const contentHash = await hashFileSha256(file.path);

      // Server-side watermark/processing. Both the input and output are temp
      // files on disk; only the processed asset is persisted below. Images
      // also get a watermarked WEBP thumbnail derivative (SS-129).
      processed = await this.mediaProcessing.process(
        file.path,
        detectedMime,
        this.tempDir,
      );
      const sizeBytes = processed.sizeBytes;
      const thumbnailSizeBytes = processed.thumbnailSizeBytes ?? null;
      thumbnailKey =
        processed.thumbnailPath !== undefined
          ? `products/${productId}/${mediaId}.thumb.webp`
          : null;

      // Binary first: the database state is authoritative; if the DB write
      // fails afterwards the new binaries are cleaned up best-effort below.
      await this.storage.putFile(storageKey, processed.outputPath);
      storedKey = storageKey;
      if (thumbnailKey !== null && processed.thumbnailPath !== undefined) {
        await this.storage.putFile(thumbnailKey, processed.thumbnailPath);
      }

      const created = await this.prisma.$transaction(async (tx) => {
        // Row-lock the owning product: serializes concurrent uploads so the
        // exactly-one-primary invariant and sortOrder assignment are safe.
        await this.assertProductForMutation(tx, productId);
        if (dto.variantId !== undefined) {
          await this.assertVariantOwnership(tx, productId, dto.variantId);
        }

        const maxSort = await tx.productMedia.aggregate({
          where: { productId, deletedAt: null },
          _max: { sortOrder: true },
        });
        const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

        const isImage = mediaType === 'IMAGE';
        const existingPrimary = await tx.productMedia.findFirst({
          where: {
            productId,
            deletedAt: null,
            isPrimary: true,
            mediaType: 'IMAGE',
          },
          select: { id: true },
        });

        if (
          isImage &&
          existingPrimary === null &&
          dto.isPrimary === false
        ) {
          // A product must have a primary image (CATALOG-006 + validation rule
          // "minimum one primary image"). The first image cannot be uploaded
          // as non-primary, otherwise the exactly-one-primary invariant is
          // violated until a later image arrives.
          throw new ConflictException(
            'اولین تصویر محصول باید بهعنوان تصویر اصلی ثبت شود.',
          );
        }

        // First image is automatically primary; once a primary exists, later
        // images (including an explicit isPrimary: true) are never primary.
        const isPrimary = isImage && existingPrimary === null;

        const row = await tx.productMedia.create({
          data: {
            productId,
            variantId: dto.variantId ?? null,
            mediaType,
            originalName,
            mimeType: detectedMime,
            sizeBytes,
            storageKey,
            sourceUrl: dto.sourceUrl ?? null,
            contentHash,
            thumbnailKey,
            thumbnailSizeBytes,
            sortOrder,
            isPrimary,
            createdBy: actorId,
          },
        });

        await this.auditService.log(
          {
            userId: actorId,
            action: 'PRODUCT_MEDIA_UPLOADED',
            entity: MEDIA_ENTITY,
            entityId: row.id,
            before: null,
            after: {
              productId,
              variantId: dto.variantId ?? null,
              mediaType: row.mediaType,
              mimeType: row.mimeType,
              sizeBytes: row.sizeBytes,
              sourceUrl: row.sourceUrl,
              contentHash: row.contentHash,
              sortOrder: row.sortOrder,
              isPrimary: row.isPrimary,
            },
            ipAddress,
          },
          tx,
        );

        return row;
      });

      return this.toSummary(created);
    } catch (error) {
      // The database write failed after the binaries were persisted:
      // best-effort remove the orphaned binaries so no file survives without
      // a metadata row.
      for (const orphanKey of [storedKey, thumbnailKey]) {
        if (orphanKey === null) {
          continue;
        }
        try {
          await this.storage.delete(orphanKey);
        } catch (cleanupError) {
          this.logger.error(
            `Failed to clean up orphaned media binary ${orphanKey}: ${
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`,
          );
        }
      }
      // Re-importing the same origin URL for one product is a client error
      // (SS-204 idempotency), not a server failure.
      if (isSourceUrlConflict(error)) {
        throw new ConflictException(
          'این تصویر با همین آدرس منبع قبلاً برای این محصول ثبت شده است.',
        );
      }
      throw error;
    } finally {
      // Clean up temp files: the multer input and the processed output (when
      // different). Windows may briefly hold an mmap/AV handle on a file just
      // processed by libvips, so removal retries briefly before giving up.
      // Failures are logged, never allowed to mask the response.
      const toRemove = new Set<string>(
        [
          file.path,
          processed?.outputPath ?? file.path,
          processed?.thumbnailPath ?? null,
        ].filter((path): path is string => path !== null),
      );
      for (const path of toRemove) {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            await rm(path, { force: true });
            lastError = null;
            break;
          } catch (error) {
            lastError = error;
            await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
          }
        }
        if (lastError) {
          this.logger.warn(
            `Failed to remove temp file ${path}: ${
              lastError instanceof Error ? lastError.message : String(lastError)
            }`,
          );
        }
      }
    }
  }

  /**
   * Downloads the media binary of an active media row scoped to a product.
   * Missing/soft-deleted media and missing binaries all map to 404 without
   * disclosing storage internals.
   */
  async getBinary(
    productId: string,
    mediaId: string,
  ): Promise<{ buffer: Buffer; summary: ProductMediaSummary }> {
    const media = await this.findActive(productId, mediaId);

    let buffer: Buffer;
    try {
      buffer = await this.storage.get(media.storageKey);
    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw new NotFoundException('رسانه یافت نشد.');
      }
      throw error;
    }

    return { buffer, summary: this.toSummary(media) };
  }

  /**
   * Streams the media binary for download without buffering large videos into
   * memory. Missing/soft-deleted media and missing binaries map to 404 without
   * disclosing storage internals.
   */
  async getBinaryStream(
    productId: string,
    mediaId: string,
  ): Promise<{ stream: Readable; summary: ProductMediaSummary }> {
    const media = await this.findActive(productId, mediaId);

    let stream: Readable;
    try {
      stream = await this.storage.getStream(media.storageKey);
    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw new NotFoundException('رسانه یافت نشد.');
      }
      throw error;
    }

    return { stream, summary: this.toSummary(media) };
  }

  /**
   * Streams a media binary for the public catalog (SS-123). The media row must
   * be active AND its owning product must be PUBLISHED and not soft-deleted —
   * media of drafts, archived or deleted products is indistinguishable from a
   * missing asset (404), so nothing outside the live catalog can be requested.
   * Variant-scoped media of a soft-deleted variant is likewise hidden. No
   * storage internals are disclosed.
   */
  async getPublicStream(
    mediaId: string,
  ): Promise<{ stream: Readable; mimeType: string; sizeBytes: number }> {
    const media = await this.prisma.productMedia.findFirst({
      where: {
        id: mediaId,
        deletedAt: null,
        OR: [{ variantId: null }, { variant: { deletedAt: null } }],
      },
      select: {
        storageKey: true,
        mimeType: true,
        sizeBytes: true,
        product: { select: { status: true, deletedAt: true } },
      },
    });
    if (
      !media ||
      media.product.deletedAt !== null ||
      media.product.status !== ProductStatus.PUBLISHED
    ) {
      throw new NotFoundException('رسانه یافت نشد.');
    }

    let stream: Readable;
    try {
      stream = await this.storage.getStream(media.storageKey);
    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw new NotFoundException('رسانه یافت نشد.');
      }
      throw error;
    }

    return { stream, mimeType: media.mimeType, sizeBytes: media.sizeBytes };
  }

  /**
   * Streams the watermarked thumbnail derivative for the public catalog
   * (SS-129). Same visibility gate as the original: active media of a
   * PUBLISHED, non-deleted product (variant-scoped media hidden with its
   * variant); 404 when no thumbnail exists so consumers fall back to the
   * original. No storage internals are disclosed.
   */
  async getPublicThumbnail(
    mediaId: string,
  ): Promise<{ stream: Readable; sizeBytes: number }> {
    const media = await this.prisma.productMedia.findFirst({
      where: {
        id: mediaId,
        deletedAt: null,
        thumbnailKey: { not: null },
        OR: [{ variantId: null }, { variant: { is: { deletedAt: null } } }],
      },
      select: {
        thumbnailKey: true,
        thumbnailSizeBytes: true,
        product: { select: { status: true, deletedAt: true } },
      },
    });
    if (
      !media ||
      media.product.deletedAt !== null ||
      media.product.status !== ProductStatus.PUBLISHED
    ) {
      throw new NotFoundException('رسانه یافت نشد.');
    }

    let stream: Readable;
    try {
      stream = await this.storage.getStream(media.thumbnailKey as string);
    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw new NotFoundException('رسانه یافت نشد.');
      }
      throw error;
    }

    return { stream, sizeBytes: media.thumbnailSizeBytes ?? 0 };
  }

  private async findActive(
    productId: string,
    mediaId: string,
  ): Promise<Prisma.ProductMediaGetPayload<Record<string, never>>> {
    const media = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, productId, deletedAt: null },
    });
    if (!media) {
      throw new NotFoundException('رسانه یافت نشد.');
    }
    return media;
  }

  /**
   * Removes temp upload/processing files left behind by crashes or aborted
   * requests so large files do not accumulate indefinitely inside the media
   * volume. Runs once at startup; only files older than an hour are touched.
   */
  private async sweepStaleTempFiles(): Promise<void> {
    try {
      await mkdir(this.tempDir, { recursive: true });
      const cutoff = Date.now() - TEMP_FILE_MAX_AGE_MS;
      const entries = await readdir(this.tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        const full = join(this.tempDir, entry.name);
        try {
          const info = await stat(full);
          if (info.mtimeMs < cutoff) {
            await rm(full, { force: true });
          }
        } catch (error) {
          if (this.isMissingError(error)) {
            continue;
          }
          this.logger.warn(
            `Failed to inspect stale temp file ${full}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      if (this.isMissingError(error)) {
        return;
      }
      this.logger.warn(
        `Failed to sweep media temp directory ${this.tempDir}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private isMissingError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }

  /**
   * Soft-deletes a media row and removes its binary. The metadata soft-delete
   * and audit are transactional; the binary removal happens post-commit and a
   * failure is logged, never rolled back (SS-039 model). If the deleted media
   * was the primary image, the next image is promoted inside the same
   * transaction.
   */
  async remove(
    mediaId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<void> {
    const target = await this.prisma.productMedia.findFirst({
      where: { id: mediaId, deletedAt: null },
      select: {
        id: true,
        productId: true,
        variantId: true,
        mimeType: true,
        sizeBytes: true,
        sortOrder: true,
        storageKey: true,
        thumbnailKey: true,
      },
    });
    if (!target) {
      throw new NotFoundException('رسانه یافت نشد.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Row-lock the owning product so primary promotion is race-safe.
      await this.assertProductExists(tx, target.productId);

      // Re-read the media row's primary/mediaType state while holding the
      // product lock. The pre-lock snapshot (target.isPrimary) can be stale: a
      // concurrent delete that promoted this row to primary could have
      // committed between the earlier read and this transaction. Basing the
      // promotion decision on the locked state guarantees exactly one primary
      // image even when two deletes of the same product race.
      const current = await tx.productMedia.findFirst({
        where: { id: mediaId, deletedAt: null },
        select: { isPrimary: true, mediaType: true },
      });
      if (!current) {
        throw new NotFoundException('رسانه یافت نشد.');
      }

      const removed = await tx.productMedia.updateMany({
        where: { id: mediaId, deletedAt: null },
        data: { deletedAt: new Date(), updatedBy: actorId },
      });
      if (removed.count === 0) {
        throw new NotFoundException('رسانه یافت نشد.');
      }

      if (current.isPrimary && current.mediaType === 'IMAGE') {
        await this.promoteNextPrimary(tx, target.productId);
      }

      await this.auditService.log(
        {
          userId: actorId,
          action: 'PRODUCT_MEDIA_REMOVED',
          entity: MEDIA_ENTITY,
          entityId: mediaId,
          // Use the in-lock state for consistency: a concurrent delete may
          // have promoted this row to primary between the pre-lock read and
          // the locked re-read, and the audit should reflect the actual state
          // at deletion time.
          before: { isPrimary: current.isPrimary, sortOrder: target.sortOrder },
          after: {
            productId: target.productId,
            variantId: target.variantId,
            mediaType: current.mediaType,
            mimeType: target.mimeType,
            sizeBytes: target.sizeBytes,
            isPrimary: current.isPrimary,
          },
          ipAddress,
        },
        tx,
      );
    });

    // Post-commit binary removal; failures are logged, not rolled back.
    for (const binaryKey of [target.storageKey, target.thumbnailKey]) {
      if (binaryKey === null) {
        continue;
      }
      try {
        await this.storage.delete(binaryKey);
      } catch (error) {
        this.logger.error(
          `Failed to remove media binary ${binaryKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private toSummary(row: MediaRow): ProductMediaSummary {
    return {
      id: row.id,
      productId: row.productId,
      variantId: row.variantId,
      mediaType: row.mediaType,
      originalName: row.originalName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      sourceUrl: row.sourceUrl,
      contentHash: row.contentHash,
      sortOrder: row.sortOrder,
      isPrimary: row.isPrimary,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /**
   * Importer skip-check (SS-204): returns the live row previously stored
   * from this origin URL for the product, or null. Callers skip download +
   * processing on a hit, making re-imports a no-op per asset.
   */
  async findBySourceUrl(
    productId: string,
    sourceUrl: string,
  ): Promise<ProductMediaSummary | null> {
    const row = await this.prisma.productMedia.findUnique({
      where: { productId_sourceUrl: { productId, sourceUrl } },
    });
    if (!row || row.deletedAt !== null) {
      return null;
    }
    return this.toSummary(row);
  }

  private async assertProductExists(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; deletedAt: Date | null }>>`
      SELECT "id", "status", "deletedAt" FROM "Product" WHERE "id" = ${productId} FOR UPDATE
    `;
    const product = rows[0];
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
  }

  /**
   * Verify the owning product exists, is not soft-deleted, and is not
   * ARCHIVED, taking a row lock so concurrent media mutations serialize on the
   * primary/order invariant.
   */
  private async assertProductForMutation(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; deletedAt: Date | null }>>`
      SELECT "id", "status", "deletedAt" FROM "Product" WHERE "id" = ${productId} FOR UPDATE
    `;
    const product = rows[0];

    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
  }

  /**
   * Verify a supplied variant belongs to the product and is not soft-deleted.
   * A missing, soft-deleted, or cross-product variant is indistinguishable
   * from a missing one (404) so no cross-product relationship is disclosed.
   */
  private async assertVariantOwnership(
    tx: Prisma.TransactionClient,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException('واریانت یافت نشد.');
    }
  }

  /**
   * Promotes the remaining image with the lowest sortOrder to primary after
   * the current primary is deleted. Conditional updateMany guarantees exactly
   * one active primary image even under a racing deletion of the promoted row.
   */
  private async promoteNextPrimary(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const next = await tx.productMedia.findFirst({
      where: {
        productId,
        deletedAt: null,
        isPrimary: false,
        mediaType: 'IMAGE',
      },
      orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
      select: { id: true },
    });
    if (!next) {
      return;
    }
    await tx.productMedia.updateMany({
      where: { id: next.id, deletedAt: null, isPrimary: false },
      data: { isPrimary: true },
    });
  }
}

type MediaRow = Prisma.ProductMediaGetPayload<Record<string, never>>;

/** SHA-256 hex digest of a file, streamed (SS-204 dedup identity). */
async function hashFileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(path);
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end', () => resolve());
    stream.on('error', (error) => reject(error));
  });
  return hash.digest('hex');
}

/**
 * True when a P2002 targets the (productId, sourceUrl) identity (SS-204).
 * Soft-deleted rows still hold the identity, so a re-import after delete
 * also lands here — the importer (SS-208) owns the undelete policy.
 */
function isSourceUrlConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    error.meta?.modelName === 'ProductMedia' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes('sourceUrl')
  );
}
