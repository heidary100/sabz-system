import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import sharp from 'sharp';
import { PrismaService } from '../../common/database/prisma.service';
import {
  PRODUCT_MEDIA_STORAGE,
  ProductMediaStorage,
} from './storage/product-media-storage';

const MAX_CATEGORY_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_OUTPUT_EDGE = 1600;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface StoredCategoryImage {
  key: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

/**
 * Category editorial images (SS-900 Part II).
 *
 * The binary lives behind the existing ProductMediaStorage abstraction under
 * a server-generated key; PostgreSQL stores only metadata. Uploads are
 * decoded by sharp (never trusted by MIME alone), auto-oriented, bounded and
 * re-encoded to WebP while preserving the source aspect ratio. No product
 * background removal or crop is applied to a category photograph.
 */
@Injectable()
export class CategoryImageService {
  private readonly logger = new Logger(CategoryImageService.name);

  constructor(
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
    private readonly prisma: PrismaService,
  ) {}

  async store(categoryId: string, file: Express.Multer.File): Promise<StoredCategoryImage> {
    if (!file?.path) {
      throw new BadRequestException('فایل تصویر دسته‌بندی الزامی است.');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('فقط تصویر JPG، PNG یا WEBP مجاز است.');
    }
    if (file.size > MAX_CATEGORY_IMAGE_BYTES) {
      throw new BadRequestException('حجم تصویر دسته‌بندی حداکثر ۸ مگابایت است.');
    }
    try {
      const image = sharp(file.path, { failOn: 'error' });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new BadRequestException('فایل تصویر معتبر نیست.');
      }
      if (metadata.width * metadata.height > MAX_SOURCE_PIXELS) {
        throw new BadRequestException('ابعاد تصویر بیش از حد مجاز است.');
      }
      const { data, info } = await image
        .rotate()
        .resize({
          width: MAX_OUTPUT_EDGE,
          height: MAX_OUTPUT_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 84, alphaQuality: 90, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      const key = `categories/${categoryId}/${randomUUID()}.webp`;
      await this.storage.put(key, data);
      return {
        key,
        mimeType: 'image/webp',
        sizeBytes: data.byteLength,
        width: info.width,
        height: info.height,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.warn(
        `Category image decode failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('تصویر انتخاب‌شده قابل پردازش نیست.');
    } finally {
      await rm(file.path, { force: true }).catch(() => undefined);
    }
  }

  async delete(key: string | null | undefined): Promise<void> {
    if (!key) return;
    await this.storage.delete(key).catch((error) => {
      this.logger.warn(
        `Category image cleanup failed for ${key}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async read(categoryId: string): Promise<{
    stream: Readable;
    mimeType: string;
    sizeBytes: number;
  }> {
    const row = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
      select: {
        imageStorageKey: true,
        imageMimeType: true,
        imageSizeBytes: true,
      },
    });
    if (!row?.imageStorageKey) {
      throw new NotFoundException('تصویری برای این دسته‌بندی ثبت نشده است.');
    }
    const stream = await this.storage.getStream(row.imageStorageKey);
    return {
      stream,
      mimeType: row.imageMimeType ?? 'image/webp',
      sizeBytes: row.imageSizeBytes ?? 0,
    };
  }
}
