import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
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
import {
  PRODUCT_MEDIA_STORAGE,
  ProductMediaStorage,
} from './storage/product-media-storage';
import { LocalDiskMediaStorage } from './storage/local-disk-media.storage';

/**
 * Product-domain module (SS-102/SS-103/SS-104/SS-105). Owns the operator/admin
 * product administration API: products, categories, brands (CRUD, soft-delete,
 * hierarchy and slug semantics), product variants (CRUD, soft-delete and the M1
 * inventory boundary) and product media (upload/list/download/delete backed by
 * the Product-domain ProductMediaStorage abstraction). Mutations write audit
 * events through the shared AuditService.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    BrandsController,
    ProductVariantsController,
    AdminVariantsController,
    ProductMediaController,
    AdminMediaController,
  ],
  providers: [
    ProductsService,
    CategoriesService,
    BrandsService,
    VariantsService,
    MediaService,
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
  ],
  exports: [MediaService, PRODUCT_MEDIA_STORAGE],
})
export class ProductsModule {}
