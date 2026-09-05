import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { AdminVariantsController, ProductVariantsController } from './variants.controller';
import { VariantsService } from './variants.service';
import {
  AdminMediaController,
  ProductMediaController,
} from './media.controller';
import { MediaService } from './media.service';
import { DescriptionImageService } from './description-image.service';
import {
  AdminDescriptionImagesController,
  PublicDescriptionImagesController,
} from './description-images.controller';
import {
  PRODUCT_MEDIA_STORAGE,
  ProductMediaStorage,
} from './storage/product-media-storage';
import { LocalDiskMediaStorage } from './storage/local-disk-media.storage';
import {
  WATERMARK_CONFIG,
  resolveWatermarkConfig,
} from './media-processing/watermark-config';
import { FfmpegRunner } from './media-processing/ffmpeg.runner';
import { WatermarkOverlayService } from './media-processing/watermark-overlay.service';
import { ImageProcessorService } from './media-processing/image-processor.service';
import { VideoProcessorService } from './media-processing/video-processor.service';
import { MediaProcessingService } from './media-processing/media-processing.service';

export const PRODUCT_MEDIA_TEMP_DIR = 'PRODUCT_MEDIA_TEMP_DIR';

/**
 * Product-domain module (SS-102/SS-103/SS-104/SS-105). Owns the operator/admin
 * product administration API: products, categories, brands (CRUD, soft-delete,
 * hierarchy and slug semantics), product variants (CRUD, soft-delete and the M1
 * inventory boundary) and product media (upload/list/download/delete backed by
 * the Product-domain ProductMediaStorage abstraction). Uploaded media is
 * watermarked server-side (CATALOG-007) by the media-processing pipeline
 * (sharp for images, FFmpeg for videos). Mutations write audit events through
 * the shared AuditService.
 */
@Module({
  imports: [AuthModule, AuditModule, InventoryModule],
  controllers: [
    ProductsController,
    CategoriesController,
    BrandsController,
    ProductVariantsController,
    AdminVariantsController,
    ProductMediaController,
    AdminMediaController,
    AdminDescriptionImagesController,
    PublicDescriptionImagesController,
  ],
  providers: [
    ProductsService,
    CategoriesService,
    BrandsService,
    VariantsService,
    MediaService,
    DescriptionImageService,
    {
      provide: PRODUCT_MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): ProductMediaStorage => {
        const driver = configService.get<string>(
          'PRODUCT_MEDIA_STORAGE_DRIVER',
          'local',
        );
        if (driver !== 'local') {
          throw new Error(
            `Unsupported PRODUCT_MEDIA_STORAGE_DRIVER: ${driver}. Only 'local' is implemented.`,
          );
        }
        const dir = configService.get<string>(
          'PRODUCT_MEDIA_STORAGE_DIR',
          '.data/product-media',
        );
        return new LocalDiskMediaStorage(dir);
      },
    },
    {
      provide: PRODUCT_MEDIA_TEMP_DIR,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): string => {
        const storageDir = configService.get<string>(
          'PRODUCT_MEDIA_STORAGE_DIR',
          '.data/product-media',
        );
        return (
          configService.get<string>('PRODUCT_MEDIA_TEMP_DIR') ??
          join(storageDir, 'tmp')
        );
      },
    },
    {
      provide: WATERMARK_CONFIG,
      useFactory: resolveWatermarkConfig,
    },
    {
      provide: FfmpegRunner,
      useFactory: () => new FfmpegRunner(FfmpegRunner.resolveBinary()),
    },
    WatermarkOverlayService,
    ImageProcessorService,
    {
      provide: VideoProcessorService,
      inject: [WatermarkOverlayService, FfmpegRunner, WATERMARK_CONFIG, PRODUCT_MEDIA_TEMP_DIR],
      useFactory: (
        overlay: WatermarkOverlayService,
        ffmpeg: FfmpegRunner,
        config: ReturnType<typeof resolveWatermarkConfig>,
        tempDir: string,
      ) => new VideoProcessorService(overlay, ffmpeg, config, tempDir),
    },
    MediaProcessingService,
  ],
  exports: [MediaService, PRODUCT_MEDIA_STORAGE],
})
export class ProductsModule {}
