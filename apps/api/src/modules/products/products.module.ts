import { Module } from '@nestjs/common';
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

/**
 * Product-domain module (SS-102/SS-103/SS-104). Owns the operator/admin product
 * administration API: products, categories, brands (CRUD, soft-delete,
 * hierarchy and slug semantics) and product variants (CRUD, soft-delete and the
 * M1 inventory boundary). Mutations write audit events through the shared
 * AuditService. Product media/storage belong to SS-105.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    BrandsController,
    ProductVariantsController,
    AdminVariantsController,
  ],
  providers: [
    ProductsService,
    CategoriesService,
    BrandsService,
    VariantsService,
  ],
})
export class ProductsModule {}
