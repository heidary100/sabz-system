import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * Product-domain module (SS-102/SS-103). Owns the operator/admin product
 * administration API: products, categories and brands (CRUD, soft-delete,
 * hierarchy and slug semantics). Mutations write audit events through the
 * shared AuditService. Variants (SS-104) and media (SS-105) are read-only
 * here; brand logo/media belong to SS-105.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [
    ProductsController,
    CategoriesController,
    BrandsController,
  ],
  providers: [
    ProductsService,
    CategoriesService,
    BrandsService,
  ],
})
export class ProductsModule {}
