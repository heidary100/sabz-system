import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';

describe('Prisma schema numeric precision (SS-031)', () => {
  const partnerTier = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'PartnerTier',
  );

  it('constrains discountPercent to NUMERIC(5,2) so percentages stay meaningful', () => {
    const field = partnerTier?.fields.find(
      (candidate) => candidate.name === 'discountPercent',
    );

    expect(field).toBeDefined();
    // NUMERIC(5,2) accepts 0.00-999.99: representative values such as 0,
    // 12.5 and 100.00 fit; values beyond the precision are rejected.
    expect(field!.type).toBe('Decimal');
    expect(field!.nativeType).toEqual(['Decimal', ['5', '2']]);
  });

  it('keeps minOrderQuantity as Int, which is sufficient for order quantities', () => {
    const field = partnerTier?.fields.find(
      (candidate) => candidate.name === 'minOrderQuantity',
    );

    expect(field).toBeDefined();
    expect(field!.type).toBe('Int');
    expect(field!.nativeType).toBeNull();
  });
});

describe('Partner lifecycle and BusinessDocument schema (SS-038)', () => {
  const partner = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'Partner',
  );
  const businessDocument = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'BusinessDocument',
  );
  const approvalStatusEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'PartnerApprovalStatus',
  );
  const documentTypeEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'PartnerDocumentType',
  );

  const ss038Migration = () => {
    const migrationsDir = join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const folder = readdirSync(migrationsDir).find((name) =>
      name.includes('ss_038_partner_lifecycle_and_business_documents'),
    );
    expect(folder).toBeDefined();
    return readFileSync(join(migrationsDir, folder!, 'migration.sql'), 'utf8');
  };

  it('includes DRAFT in PartnerApprovalStatus', () => {
    const values = approvalStatusEnum?.values.map((value) => value.name);
    expect(values).toEqual(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED']);
  });

  it('defaults Partner.approvalStatus to DRAFT', () => {
    const field = partner?.fields.find(
      (candidate) => candidate.name === 'approvalStatus',
    );

    expect(field).toBeDefined();
    expect(field!.type).toBe('PartnerApprovalStatus');
    expect(field!.default).toBe('DRAFT');
  });

  it('keeps the lifecycle timestamps and review fields on Partner', () => {
    const expected = ['submittedAt', 'rejectedAt', 'rejectionReason', 'reviewNotes'];
    for (const name of expected) {
      const field = partner?.fields.find((candidate) => candidate.name === name);
      expect(field).toBeDefined();
      expect(field!.type).toBe(name.includes('At') ? 'DateTime' : 'String');
      expect(field!.isRequired).toBe(false);
    }
  });

  it('defines the BusinessDocument model', () => {
    expect(businessDocument).toBeDefined();
    const expected = [
      'id',
      'partnerId',
      'type',
      'originalName',
      'mimeType',
      'sizeBytes',
      'storageKey',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'createdBy',
      'updatedBy',
    ];
    const names = businessDocument!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));
  });

  it('links BusinessDocument to Partner via a cascading relation', () => {
    const partnerRelation = businessDocument?.fields.find(
      (candidate) => candidate.name === 'partner',
    );

    expect(partnerRelation).toBeDefined();
    expect(partnerRelation!.kind).toBe('object');
    expect(partnerRelation!.type).toBe('Partner');
    expect(partnerRelation!.relationFromFields).toEqual(['partnerId']);
    expect(partnerRelation!.relationOnDelete).toBe('Cascade');
  });

  it('makes BusinessDocument.storageKey unique', () => {
    const field = businessDocument?.fields.find(
      (candidate) => candidate.name === 'storageKey',
    );

    expect(field).toBeDefined();
    expect(field!.isUnique).toBe(true);
  });

  it('creates the BusinessDocument [partnerId, deletedAt] index', () => {
    expect(ss038Migration()).toContain(
      'CREATE INDEX "BusinessDocument_partnerId_deletedAt_idx" ON "BusinessDocument"("partnerId", "deletedAt");',
    );
  });

  it('creates the Partner [approvalStatus, submittedAt] index', () => {
    expect(ss038Migration()).toContain(
      'CREATE INDEX "Partner_approvalStatus_submittedAt_idx" ON "Partner"("approvalStatus", "submittedAt");',
    );
  });

  it('defines the PartnerDocumentType values', () => {
    const values = documentTypeEnum?.values.map((value) => value.name);
    expect(values).toEqual([
      'BUSINESS_LICENSE',
      'NATIONAL_ID',
      'TAX_REGISTRATION',
      'SUPPORTING',
    ]);
  });
});

describe('AuditLog query index (SS-064)', () => {
  const auditLog = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'AuditLog',
  );

  const ss064Migration = () => {
    const migrationsDir = join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const folder = readdirSync(migrationsDir).find((name) =>
      name.includes('ss_064_audit_query_indexes'),
    );
    expect(folder).toBeDefined();
    return readFileSync(join(migrationsDir, folder!, 'migration.sql'), 'utf8');
  };

  it('adds the [entity, createdAt] composite index for entity-scoped admin queries', () => {
    const index = auditLog?.fields.find((field) => field.name === 'createdAt');
    expect(index).toBeDefined();
    expect(ss064Migration()).toContain(
      'CREATE INDEX "AuditLog_entity_createdAt_idx" ON "AuditLog"("entity", "createdAt");',
    );
  });
});

describe('Product catalog enums (SS-100)', () => {
  const statusEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'ProductStatus',
  );
  const conditionEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'ProductCondition',
  );
  const mediaTypeEnum = Prisma.dmmf.datamodel.enums.find(
    (candidate) => candidate.name === 'ProductMediaType',
  );

  it('defines the ProductStatus lifecycle values', () => {
    const values = statusEnum?.values.map((value) => value.name);
    expect(values).toEqual(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
  });

  it('defines the ProductCondition values', () => {
    const values = conditionEnum?.values.map((value) => value.name);
    expect(values).toEqual([
      'NEW',
      'OPEN_BOX',
      'REFURBISHED',
      'USED',
      'STOCK_CLEARANCE',
    ]);
  });

  it('defines the ProductMediaType values', () => {
    const values = mediaTypeEnum?.values.map((value) => value.name);
    expect(values).toEqual(['IMAGE', 'VIDEO']);
  });
});

describe('Product catalog models and relations (SS-100)', () => {
  const model = (name: string) =>
    Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === name);

  const category = model('Category');
  const brand = model('Brand');
  const product = model('Product');
  const variant = model('ProductVariant');
  const media = model('ProductMedia');

  const AUDIT_FIELDS = [
    'createdAt',
    'updatedAt',
    'deletedAt',
    'createdBy',
    'updatedBy',
  ];

  it('defines the Category model with hierarchy, ordering and visibility', () => {
    expect(category).toBeDefined();
    const expected = [
      'id',
      'name',
      'slug',
      'parentId',
      'sortOrder',
      'isVisible',
      ...AUDIT_FIELDS,
    ];
    const names = category!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));
  });

  it('makes Category.slug unique and indexes Category.parentId', () => {
    const slug = category?.fields.find((field) => field.name === 'slug');
    expect(slug).toBeDefined();
    expect(slug!.isUnique).toBe(true);

    const parentIndex = category?.fields.find(
      (field) => field.name === 'parentId',
    );
    expect(parentIndex).toBeDefined();
    expect(parentIndex!.isId).toBe(false);
  });

  it('makes Category a self-referencing tree through parentId', () => {
    const parent = category?.fields.find((field) => field.name === 'parent');
    const children = category?.fields.find((field) => field.name === 'children');

    expect(parent).toBeDefined();
    expect(parent!.kind).toBe('object');
    expect(parent!.type).toBe('Category');
    expect(parent!.relationFromFields).toEqual(['parentId']);
    expect(parent!.relationOnDelete).toBe('SetNull');

    expect(children).toBeDefined();
    expect(children!.kind).toBe('object');
    expect(children!.type).toBe('Category');
  });

  it('defaults Category.sortOrder to 0 and isVisible to true', () => {
    const sortOrder = category?.fields.find(
      (field) => field.name === 'sortOrder',
    );
    const isVisible = category?.fields.find((field) => field.name === 'isVisible');
    expect(sortOrder!.default).toBe(0);
    expect(isVisible!.default).toBe(true);
  });

  it('defines the Brand model with metadata fields and audit fields', () => {
    expect(brand).toBeDefined();
    const expected = [
      'id',
      'name',
      'slug',
      'description',
      'logoKey',
      'isFeatured',
      ...AUDIT_FIELDS,
    ];
    const names = brand!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));

    const slug = brand?.fields.find((field) => field.name === 'slug');
    expect(slug!.isUnique).toBe(true);

    const isFeatured = brand?.fields.find((field) => field.name === 'isFeatured');
    expect(isFeatured!.default).toBe(false);
  });

  it('defines the Product model with catalog fields but NO sellable SKU', () => {
    expect(product).toBeDefined();
    const expected = [
      'id',
      'name',
      'slug',
      'shortDescription',
      'description',
      'brandId',
      'categoryId',
      'warranty',
      'condition',
      'status',
      'weightKg',
      'widthCm',
      'heightCm',
      'depthCm',
      'originCountry',
      ...AUDIT_FIELDS,
    ];
    const names = product!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));

    expect(product!.fields.find((field) => field.name === 'sku')).toBeUndefined();
  });

  it('makes Product.slug unique and defaults status to DRAFT', () => {
    const slug = product?.fields.find((field) => field.name === 'slug');
    expect(slug!.isUnique).toBe(true);

    const status = product?.fields.find((field) => field.name === 'status');
    expect(status!.type).toBe('ProductStatus');
    expect(status!.default).toBe('DRAFT');

    const condition = product?.fields.find((field) => field.name === 'condition');
    expect(condition!.type).toBe('ProductCondition');
    expect(condition!.isRequired).toBe(true);
  });

  it('gives Product required brand and category relations', () => {
    const brandRelation = product?.fields.find(
      (field) => field.name === 'brand',
    );
    const categoryRelation = product?.fields.find(
      (field) => field.name === 'category',
    );

    expect(brandRelation).toBeDefined();
    expect(brandRelation!.kind).toBe('object');
    expect(brandRelation!.type).toBe('Brand');
    expect(brandRelation!.relationFromFields).toEqual(['brandId']);

    expect(categoryRelation).toBeDefined();
    expect(categoryRelation!.kind).toBe('object');
    expect(categoryRelation!.type).toBe('Category');
    expect(categoryRelation!.relationFromFields).toEqual(['categoryId']);
  });

  it('uses the documented Decimal native types for product dimensions', () => {
    const weightKg = product?.fields.find((field) => field.name === 'weightKg');
    expect(weightKg!.type).toBe('Decimal');
    expect(weightKg!.nativeType).toEqual(['Decimal', ['8', '3']]);

    for (const name of ['widthCm', 'heightCm', 'depthCm']) {
      const field = product?.fields.find((candidate) => candidate.name === name);
      expect(field!.type).toBe('Decimal');
      expect(field!.nativeType).toEqual(['Decimal', ['8', '2']]);
    }
  });

  it('defines the ProductVariant model with variant-owned SKU and price', () => {
    expect(variant).toBeDefined();
    const expected = [
      'id',
      'productId',
      'sku',
      'barcode',
      'name',
      'price',
      'stockQuantity',
      ...AUDIT_FIELDS,
    ];
    const names = variant!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));

    const sku = variant?.fields.find((field) => field.name === 'sku');
    expect(sku!.isUnique).toBe(true);
  });

  it('uses Decimal(12,2) for the variant retail/base price', () => {
    const price = variant?.fields.find((field) => field.name === 'price');
    expect(price).toBeDefined();
    expect(price!.type).toBe('Decimal');
    expect(price!.nativeType).toEqual(['Decimal', ['12', '2']]);
    expect(price!.isRequired).toBe(true);
  });

  it('defaults ProductVariant.stockQuantity to 0', () => {
    const stockQuantity = variant?.fields.find(
      (field) => field.name === 'stockQuantity',
    );
    expect(stockQuantity).toBeDefined();
    expect(stockQuantity!.type).toBe('Int');
    expect(stockQuantity!.default).toBe(0);
  });

  it('cascades ProductVariant on Product deletion', () => {
    const productRelation = variant?.fields.find(
      (field) => field.name === 'product',
    );
    expect(productRelation).toBeDefined();
    expect(productRelation!.kind).toBe('object');
    expect(productRelation!.type).toBe('Product');
    expect(productRelation!.relationFromFields).toEqual(['productId']);
    expect(productRelation!.relationOnDelete).toBe('Cascade');
  });

  it('defines the ProductMedia model with metadata, ordering and storage key', () => {
    expect(media).toBeDefined();
    const expected = [
      'id',
      'productId',
      'variantId',
      'mediaType',
      'originalName',
      'mimeType',
      'sizeBytes',
      'storageKey',
      'sortOrder',
      'isPrimary',
      ...AUDIT_FIELDS,
    ];
    const names = media!.fields.map((field) => field.name);
    expect(names).toEqual(expect.arrayContaining(expected));

    const storageKey = media?.fields.find((field) => field.name === 'storageKey');
    expect(storageKey!.isUnique).toBe(true);

    const sortOrder = media?.fields.find((field) => field.name === 'sortOrder');
    expect(sortOrder!.default).toBe(0);

    const isPrimary = media?.fields.find((field) => field.name === 'isPrimary');
    expect(isPrimary!.default).toBe(false);
  });

  it('owns ProductMedia on Product (Cascade) and references ProductVariant optionally (SetNull)', () => {
    const productRelation = media?.fields.find(
      (field) => field.name === 'product',
    );
    const variantRelation = media?.fields.find(
      (field) => field.name === 'variant',
    );

    expect(productRelation).toBeDefined();
    expect(productRelation!.kind).toBe('object');
    expect(productRelation!.type).toBe('Product');
    expect(productRelation!.relationFromFields).toEqual(['productId']);
    expect(productRelation!.relationOnDelete).toBe('Cascade');

    expect(variantRelation).toBeDefined();
    expect(variantRelation!.kind).toBe('object');
    expect(variantRelation!.type).toBe('ProductVariant');
    expect(variantRelation!.relationFromFields).toEqual(['variantId']);
    expect(variantRelation!.isRequired).toBe(false);
    expect(variantRelation!.relationOnDelete).toBe('SetNull');
  });
});

describe('Product catalog indexes and migration (SS-100)', () => {
  const ss100Migration = () => {
    const migrationsDir = join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const folder = readdirSync(migrationsDir).find((name) =>
      name.includes('ss_100_product_catalog_foundation'),
    );
    expect(folder).toBeDefined();
    return readFileSync(join(migrationsDir, folder!, 'migration.sql'), 'utf8');
  };

  const sql = ss100Migration();

  it('creates the catalog unique indexes', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "ProductMedia_storageKey_key" ON "ProductMedia"("storageKey");',
    );
  });

  it('creates the justified listing indexes', () => {
    expect(sql).toContain(
      'CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");',
    );
    expect(sql).toContain(
      'CREATE INDEX "Category_isVisible_deletedAt_idx" ON "Category"("isVisible", "deletedAt");',
    );
    expect(sql).toContain(
      'CREATE INDEX "Product_status_deletedAt_idx" ON "Product"("status", "deletedAt");',
    );
    expect(sql).toContain(
      'CREATE INDEX "Product_categoryId_deletedAt_idx" ON "Product"("categoryId", "deletedAt");',
    );
    expect(sql).toContain(
      'CREATE INDEX "Product_brandId_deletedAt_idx" ON "Product"("brandId", "deletedAt");',
    );
    expect(sql).toContain(
      'CREATE INDEX "ProductVariant_productId_deletedAt_idx" ON "ProductVariant"("productId", "deletedAt");',
    );
    expect(sql).toContain(
      'CREATE INDEX "ProductMedia_productId_deletedAt_idx" ON "ProductMedia"("productId", "deletedAt");',
    );
    expect(sql).toContain(
      'CREATE INDEX "ProductMedia_productId_sortOrder_idx" ON "ProductMedia"("productId", "sortOrder");',
    );
    expect(sql).toContain(
      'CREATE INDEX "ProductMedia_variantId_idx" ON "ProductMedia"("variantId");',
    );
  });

  it('creates the catalog enums and tables', () => {
    expect(sql).toContain(
      `CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');`,
    );
    expect(sql).toContain(
      `CREATE TYPE "ProductCondition" AS ENUM ('NEW', 'OPEN_BOX', 'REFURBISHED', 'USED', 'STOCK_CLEARANCE');`,
    );
    expect(sql).toContain(
      `CREATE TYPE "ProductMediaType" AS ENUM ('IMAGE', 'VIDEO');`,
    );
    for (const table of ['Category', 'Brand', 'Product', 'ProductVariant', 'ProductMedia']) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it('enforces the approved FK ON DELETE semantics', () => {
    expect(sql).toContain(
      'ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;',
    );
    expect(sql).toContain(
      'ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
    );
  });

  it('uses the documented Decimal native types in the migration', () => {
    expect(sql).toContain('"price" DECIMAL(12,2) NOT NULL');
    expect(sql).toContain('"weightKg" DECIMAL(8,3)');
    expect(sql).toContain('"widthCm" DECIMAL(8,2)');
    expect(sql).toContain('"heightCm" DECIMAL(8,2)');
    expect(sql).toContain('"depthCm" DECIMAL(8,2)');
  });

  it('keeps the migration free of destructive changes to existing tables', () => {
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('ALTER TABLE "User"');
    expect(sql).not.toContain('ALTER TABLE "Partner"');
    expect(sql).not.toContain('ALTER TABLE "BusinessDocument"');
  });
});
