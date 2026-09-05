import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { rm, stat } from 'fs/promises';
import type { Readable } from 'stream';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MediaProcessingService } from './media-processing/media-processing.service';
import { downloadImageToTemp } from './secure-image-import';
import { readFileHeader } from './media-file';
import {
  extensionForMediaMime,
  MEDIA_HEADER_READ_BYTES,
  validateDescriptionImageFile,
  validateImportedDescriptionImage,
} from './media-validation';
import {
  MediaNotFoundError,
  PRODUCT_MEDIA_STORAGE,
  ProductMediaStorage,
} from './storage/product-media-storage';

/** Server-generated storage key prefix for inline description images. */
export const DESCRIPTION_IMAGE_KEY_PREFIX = 'descriptions';

const DESCRIPTION_IMAGE_ENTITY = 'ProductDescriptionImage';

/** Matches a server-generated `descriptions/<uuid>.<ext>` file name. */
const DESCRIPTION_IMAGE_FILE_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Inline rich-text description images (product long description content).
 *
 * The content editor inserts `<figure>`-wrapped `<img>` tags into the
 * description. Uploads are validated (images only, 5 MB, magic bytes),
 * watermarked server-side through the shared media-processing pipeline
 * (CATALOG-007 — the same branding policy as catalog product media), and
 * stored through the Product-media storage abstraction under
 * `descriptions/<uuid>.<ext>`, then served by a public read-only endpoint so
 * both the admin preview and the storefront can render the description. No
 * database record is created — the URL is referenced inline by the description
 * HTML; cleanup of uploaded images that are never referenced is left to future
 * work (mirrors the deferred public-media-delivery boundary). Uploads are
 * product-scoped and audited.
 */
@Injectable()
export class DescriptionImageService {
  private readonly logger = new Logger(DescriptionImageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
    private readonly mediaProcessing: MediaProcessingService,
    @Inject('PRODUCT_MEDIA_TEMP_DIR') private readonly tempDir: string,
  ) {}

  /**
   * Validates, watermarks and stores a description image, returning its public
   * URL. The URL is relative (`/api/v1/description-images/<file>`) so stored
   * content stays host-agnostic; each frontend resolves it through its API
   * route.
   */
  async upload(
    productId: string,
    file: Express.Multer.File,
    actorId: string,
    ipAddress?: string,
  ): Promise<{ id: string; url: string }> {
    if (!file.path) {
      throw new BadRequestException('فایل الزامی است.');
    }

    // Everything below must be inside the try/finally so a failed validation
    // or processing run cannot leave the multer temp file behind.
    let processed: { outputPath: string; sizeBytes: number } | null = null;
    let storedKey: string | null = null;
    try {
      const header = await readFileHeader(file.path, MEDIA_HEADER_READ_BYTES);
      const sizeBytes = (await stat(file.path)).size;
      const detectedMime = validateDescriptionImageFile(
        file.mimetype,
        header,
        sizeBytes,
      );

      const mediaId = randomUUID();
      const extension = extensionForMediaMime(detectedMime);
      const storageKey = `${DESCRIPTION_IMAGE_KEY_PREFIX}/${mediaId}.${extension}`;
      const url = `/api/v1/description-images/${mediaId}.${extension}`;

      // Verify the owning product is manageable (exists, not soft-deleted, not
      // archived) before persisting anything.
      await this.assertProductForImage(productId);

      // Watermark/process server-side so the stored asset carries the company
      // branding (same policy as catalog product media). Both the input and the
      // processed output are temp files; only the processed asset is persisted.
      processed = await this.mediaProcessing.process(
        file.path,
        detectedMime,
        this.tempDir,
      );

      await this.storage.putFile(storageKey, processed.outputPath);
      storedKey = storageKey;
      await this.auditService.log({
        userId: actorId,
        action: 'PRODUCT_DESCRIPTION_IMAGE_UPLOADED',
        entity: DESCRIPTION_IMAGE_ENTITY,
        entityId: mediaId,
        before: null,
        after: { productId, mimeType: detectedMime, url },
        ipAddress,
      });

      return { id: mediaId, url };
    } catch (error) {
      // Best-effort remove the orphaned binary so no file survives without an
      // audit/reference path.
      if (storedKey) {
        await this.removeOrphan(storedKey);
      }
      throw error;
    } finally {
      // Clean up temp files (input + processed output); failures are logged,
      // never allowed to mask the response.
      await this.removeTempFiles([file.path, processed?.outputPath ?? file.path]);
    }
  }

  /**
   * Imports a remote image URL into controlled storage (SSRF-hardened fetch,
   * magic-byte/size validation, then the same watermark + store + audit path
   * as a direct upload). Inserting external URLs through the editor always
   * lands here, so external images never bypass the media/branding policy.
   */
  async importFromUrl(
    productId: string,
    url: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<{ id: string; url: string }> {
    // Verify the owning product is manageable before fetching anything.
    await this.assertProductForImage(productId);

    const allowPrivate =
      process.env.DESCRIPTION_IMAGE_IMPORT_ALLOW_PRIVATE === 'true';
    const { filePath, dir } = await downloadImageToTemp(url, allowPrivate);

    let processed: { outputPath: string; sizeBytes: number } | null = null;
    let storedKey: string | null = null;
    try {
      const header = await readFileHeader(filePath, MEDIA_HEADER_READ_BYTES);
      const sizeBytes = (await stat(filePath)).size;
      const detectedMime = validateImportedDescriptionImage(header, sizeBytes);

      const mediaId = randomUUID();
      const extension = extensionForMediaMime(detectedMime);
      const storageKey = `${DESCRIPTION_IMAGE_KEY_PREFIX}/${mediaId}.${extension}`;
      const resultUrl = `/api/v1/description-images/${mediaId}.${extension}`;

      processed = await this.mediaProcessing.process(
        filePath,
        detectedMime,
        this.tempDir,
      );
      await this.storage.putFile(storageKey, processed.outputPath);
      storedKey = storageKey;
      await this.auditService.log({
        userId: actorId,
        action: 'PRODUCT_DESCRIPTION_IMAGE_IMPORTED',
        entity: DESCRIPTION_IMAGE_ENTITY,
        entityId: mediaId,
        before: null,
        after: { productId, mimeType: detectedMime, url: resultUrl, importedFrom: url },
        ipAddress,
      });

      return { id: mediaId, url: resultUrl };
    } catch (error) {
      // Best-effort remove any binary written before a failure.
      if (storedKey) {
        await this.removeOrphan(storedKey);
      }
      throw error;
    } finally {
      await this.removeTempFiles([
        filePath,
        processed?.outputPath ?? null,
      ]);
      try {
        await rm(dir, { recursive: true, force: true });
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to remove import temp dir ${dir}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
    }
  }

  /**
   * Streams a stored description image for public rendering. The file name is
   * strictly validated (server-generated UUID + image extension) before it
   * touches the storage layer, so arbitrary paths can never be requested.
   */
  async getPublic(fileName: string): Promise<{ stream: Readable; mimeType: string }> {
    const match = DESCRIPTION_IMAGE_FILE_PATTERN.exec(fileName);
    if (!match) {
      throw new NotFoundException('تصویر یافت نشد.');
    }
    const extension = match[1] as 'jpg' | 'png' | 'webp';
    const mimeType = mimeTypeForExtension(extension);
    const storageKey = `${DESCRIPTION_IMAGE_KEY_PREFIX}/${fileName}`;

    try {
      const stream = await this.storage.getStream(storageKey);
      return { stream, mimeType };
    } catch (error) {
      if (error instanceof MediaNotFoundError) {
        throw new NotFoundException('تصویر یافت نشد.');
      }
      throw error;
    }
  }

  private async assertProductForImage(productId: string): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!product || product.deletedAt !== null) {
      throw new NotFoundException('محصول یافت نشد.');
    }
    if (product.status === ProductStatus.ARCHIVED) {
      throw new ConflictException(
        'محصول آرشیوشده قابل ویرایش نیست؛ ابتدا وضعیت آن را بازگردانید.',
      );
    }
  }

  /** Best-effort removal of a stored binary left without an audit reference. */
  private async removeOrphan(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (cleanupError) {
      this.logger.error(
        `Failed to clean up orphaned description image ${storageKey}: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`,
      );
    }
  }

  /** Best-effort removal of temp files; failures are logged, never thrown. */
  private async removeTempFiles(paths: Array<string | null | undefined>): Promise<void> {
    const unique = new Set(paths.filter((path): path is string => Boolean(path)));
    for (const path of unique) {
      try {
        await rm(path, { force: true });
      } catch (cleanupError) {
        this.logger.warn(
          `Failed to remove description image temp file ${path}: ${
            cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
          }`,
        );
      }
    }
  }
}

function mimeTypeForExtension(extension: 'jpg' | 'png' | 'webp'): string {
  if (extension === 'jpg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return 'image/webp';
}