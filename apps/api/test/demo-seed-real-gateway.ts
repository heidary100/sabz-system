import {
  Prisma,
  PrismaClient,
  ProductCondition,
  ProductStatus,
} from '@prisma/client';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { MERCH_HOMEPAGE_DRAFT_ID } from '@sabz/types';
import sharp from 'sharp';
import type { DemoSeedManifest } from '../src/modules/merchandising/demo-seed/types';
import { approvedManifest } from '../src/modules/merchandising/demo-seed/test-fixtures';
import { expectedMediaOriginalName } from '../src/modules/merchandising/demo-seed/ownership';
import {
  assertHomepageDraftRestored,
  assertHomepagePublicationStatusRestored,
  assertMerchMediaMetadataRestored,
  restoreHomepageDraft,
  restoreHomepagePublicationStatus,
  restoreMerchMediaMetadata,
  runCleanupActions,
  type CleanupAction,
  type CleanupFailure,
  type HomepagePublicationStatusSnapshot,
  type MerchMediaMetadataSnapshot,
} from './demo-seed-cleanup';

/**
 * Shared real-PostgreSQL fixture for demo-seed gateway tests. It provisions
 * only disposable rows tagged with a unique stamp and returns exact cleanup
 * actions. It never deletes rows selected by anything other than the IDs and
 * names it created.
 */
export interface RealGatewayScenario {
  stamp: string;
  manifest: DemoSeedManifest;
  assetsRoot: string;
  storageRoot: string;
  backupRoot: string;
  expectedMediaNames: string[];
  categoryIds: string[];
  brandIds: string[];
  productIds: string[];
  variantIds: string[];
  warehouseIds: string[];
}

export interface RealGatewayFixture {
  scenario: RealGatewayScenario;
  cleanupActions: CleanupAction[];
}

export async function createRealGatewayFixture(
  prisma: PrismaClient,
  stamp: string,
  operationIds: string[],
): Promise<RealGatewayFixture> {
  const priorDraft = await prisma.homepageDraft.findUnique({
    where: { id: MERCH_HOMEPAGE_DRAFT_ID },
  });
  const priorPublications: HomepagePublicationStatusSnapshot[] =
    await prisma.homepagePublication.findMany({
      select: { id: true, status: true, updatedAt: true },
    });
  const priorPublishedMedia: MerchMediaMetadataSnapshot[] =
    await prisma.merchMedia.findMany({
      where: { publishedAt: { not: null } },
      select: {
        id: true,
        publishedAt: true,
        updatedBy: true,
        updatedAt: true,
      },
    });

  const assetsRoot = await mkdtemp(join(tmpdir(), 'demo-seed-gateway-assets-'));
  const storageRoot = await mkdtemp(join(tmpdir(), 'demo-seed-gateway-storage-'));
  const backupRoot = await mkdtemp(join(tmpdir(), 'demo-seed-gateway-backups-'));
  const previousStorageDir = process.env.PRODUCT_MEDIA_STORAGE_DIR;
  const previousTempDir = process.env.PRODUCT_MEDIA_TEMP_DIR;

  const categoryIds: string[] = [];
  const brandIds: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const warehouseIds: string[] = [];
  let manifest: DemoSeedManifest | null = null;
  let expectedMediaNames: string[] = [];

  try {
    for (let index = 0; index < 6; index += 1) {
      const category = await prisma.category.create({
        data: {
          name: `Integration Category ${stamp} ${index}`,
          slug: `integration-${stamp}-category-${index}`,
          sortOrder: index,
          isVisible: true,
        },
      });
      categoryIds.push(category.id);
    }
    for (let index = 0; index < 4; index += 1) {
      const brand = await prisma.brand.create({
        data: {
          name: `Integration Brand ${stamp} ${index}`,
          slug: `integration-${stamp}-brand-${index}`,
        },
      });
      brandIds.push(brand.id);
    }
    const warehouse = await prisma.warehouse.create({
      data: {
        code: `it-${stamp}`,
        name: `Integration Warehouse ${stamp}`,
      },
    });
    warehouseIds.push(warehouse.id);

    for (let index = 0; index < 8; index += 1) {
      const product = await prisma.product.create({
        data: {
          name: `Integration Product ${stamp} ${index}`,
          slug: `integration-${stamp}-product-${index}`,
          categoryId: categoryIds[index % categoryIds.length]!,
          brandId: brandIds[index % brandIds.length]!,
          condition: ProductCondition.NEW,
          status: ProductStatus.PUBLISHED,
        },
      });
      productIds.push(product.id);
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `IT-${stamp}-${index}`,
          name: 'Default',
          price: new Prisma.Decimal('1000000'),
          priceStatus: 'PRICED',
        },
      });
      variantIds.push(variant.id);
      await prisma.inventoryItem.create({
        data: {
          warehouseId: warehouse.id,
          variantId: variant.id,
          quantityOnHand: 10,
          quantityReserved: 0,
        },
      });
    }

    manifest = approvedManifest();
    const seededProductSlugs = Array.from(
      { length: 8 },
      (_value, index) => `integration-${stamp}-product-${index}`,
    );
    manifest.campaigns = manifest.campaigns.map((campaign) => ({
      ...campaign,
      internalName: `${campaign.internalName}-${stamp}`,
      ...(campaign.selection.products?.kind === 'explicit'
        ? {
            selection: {
              ...campaign.selection,
              products: {
                kind: 'explicit' as const,
                slugs: seededProductSlugs.slice(0, 3),
              },
            },
          }
        : {}),
    }));
    manifest.media = manifest.media.map((asset, index) => ({
      ...asset,
      fileName: `${stamp}-${index}-${asset.fileName}`,
    }));
    manifest.blog = manifest.blog.map((article) => ({
      ...article,
      slug: `${article.slug}-${stamp}`,
    }));
    expectedMediaNames = manifest.media.map(expectedMediaOriginalName);

    await mkdir(assetsRoot, { recursive: true });
    for (const [index, asset] of manifest.media.entries()) {
      const bytes = await sharp({
        create: {
          width: 20 + index,
          height: 20 + index,
          channels: 3,
          background: {
            r: 20 + index * 10,
            g: 40 + index * 5,
            b: 60 + index * 3,
          },
        },
      })
        .jpeg()
        .toBuffer();
      await writeFile(join(assetsRoot, asset.fileName), bytes);
    }

    process.env.PRODUCT_MEDIA_STORAGE_DIR = storageRoot;
    process.env.PRODUCT_MEDIA_TEMP_DIR = join(storageRoot, 'tmp');
  } catch (error) {
    await rm(assetsRoot, { recursive: true, force: true });
    await rm(storageRoot, { recursive: true, force: true });
    await rm(backupRoot, { recursive: true, force: true });
    throw error;
  }

  const cleanupActions: CleanupAction[] = [
    {
      name: 'restore media environment',
      run: () => {
        if (previousStorageDir === undefined) {
          delete process.env.PRODUCT_MEDIA_STORAGE_DIR;
        } else {
          process.env.PRODUCT_MEDIA_STORAGE_DIR = previousStorageDir;
        }
        if (previousTempDir === undefined) {
          delete process.env.PRODUCT_MEDIA_TEMP_DIR;
        } else {
          process.env.PRODUCT_MEDIA_TEMP_DIR = previousTempDir;
        }
      },
    },
    {
      name: 'delete demo journals',
      resource: operationIds.join(','),
      run: async () => {
        await prisma.homepageDemoSeedOperation.deleteMany({
          where: { id: { in: operationIds } },
        });
      },
    },
    {
      name: 'delete demo publications',
      resource: operationIds.join(','),
      run: async () => {
        await prisma.homepagePublication.deleteMany({
          where: { demoSeedOperationId: { in: operationIds } },
        });
      },
    },
    {
      name: 'delete demo blog posts',
      resource: manifest!.blog.map((article) => article.slug).join(','),
      run: async () => {
        await prisma.blogPost.deleteMany({
          where: {
            slug: { in: manifest!.blog.map((article) => article.slug) },
          },
        });
      },
    },
    {
      name: 'delete demo campaigns',
      resource: manifest!.campaigns
        .map((campaign) => campaign.internalName)
        .join(','),
      run: async () => {
        await prisma.merchCampaign.deleteMany({
          where: {
            internalName: {
              in: manifest!.campaigns.map((campaign) => campaign.internalName),
            },
          },
        });
      },
    },
    {
      name: 'delete demo media',
      resource: expectedMediaNames.join(','),
      run: async () => {
        await prisma.merchMedia.deleteMany({
          where: { originalName: { in: expectedMediaNames } },
        });
      },
    },
    {
      name: 'delete demo inventory',
      resource: variantIds.join(','),
      run: async () => {
        await prisma.inventoryItem.deleteMany({
          where: { variantId: { in: variantIds } },
        });
      },
    },
    {
      name: 'delete demo variants',
      resource: variantIds.join(','),
      run: async () => {
        await prisma.productVariant.deleteMany({
          where: { id: { in: variantIds } },
        });
      },
    },
    {
      name: 'delete demo products',
      resource: productIds.join(','),
      run: async () => {
        await prisma.product.deleteMany({
          where: { id: { in: productIds } },
        });
      },
    },
    {
      name: 'delete demo brands',
      resource: brandIds.join(','),
      run: async () => {
        await prisma.brand.deleteMany({
          where: { id: { in: brandIds } },
        });
      },
    },
    {
      name: 'delete demo categories',
      resource: categoryIds.join(','),
      run: async () => {
        await prisma.category.deleteMany({
          where: { id: { in: categoryIds } },
        });
      },
    },
    {
      name: 'delete demo warehouse',
      resource: warehouseIds.join(','),
      run: async () => {
        await prisma.warehouse.deleteMany({
          where: { id: { in: warehouseIds } },
        });
      },
    },
  ];

  for (const row of priorPublishedMedia) {
    cleanupActions.push({
      name: 'restore pre-existing media metadata',
      resource: row.id,
      run: async () => {
        await restoreMerchMediaMetadata(
          (strings, ...values) => prisma.$executeRaw(strings, ...values),
          row,
        );
      },
    });
  }
  cleanupActions.push({
    name: 'verify pre-existing media metadata restoration',
    resource: `${priorPublishedMedia.length} rows`,
    run: async () => {
      await assertMerchMediaMetadataRestored(prisma, priorPublishedMedia);
    },
  });
  for (const row of priorPublications) {
    cleanupActions.push({
      name: 'restore pre-existing publication status',
      resource: row.id,
      run: async () => {
        await restoreHomepagePublicationStatus(
          (strings, ...values) => prisma.$executeRaw(strings, ...values),
          row,
        );
      },
    });
  }
  cleanupActions.push({
    name: 'verify pre-existing publication restoration',
    resource: `${priorPublications.length} rows`,
    run: async () => {
      await assertHomepagePublicationStatusRestored(prisma, priorPublications);
    },
  });
  cleanupActions.push({
    name: 'restore pre-existing homepage draft',
    resource: MERCH_HOMEPAGE_DRAFT_ID,
    run: async () => {
      if (priorDraft === null) {
        await prisma.homepageDraft.deleteMany({
          where: { id: MERCH_HOMEPAGE_DRAFT_ID },
        });
      } else {
        await restoreHomepageDraft(
          (strings, ...values) => prisma.$executeRaw(strings, ...values),
          priorDraft,
        );
      }
    },
  });
  cleanupActions.push({
    name: 'verify pre-existing homepage draft restoration',
    resource: MERCH_HOMEPAGE_DRAFT_ID,
    run: async () => {
      await assertHomepageDraftRestored(
        prisma,
        priorDraft,
        MERCH_HOMEPAGE_DRAFT_ID,
      );
    },
  });
  cleanupActions.push(
    {
      name: 'remove temporary assets directory',
      resource: assetsRoot,
      run: async () => {
        await rm(assetsRoot, { recursive: true, force: true });
      },
    },
    {
      name: 'remove temporary storage directory',
      resource: storageRoot,
      run: async () => {
        await rm(storageRoot, { recursive: true, force: true });
      },
    },
    {
      name: 'remove temporary backup directory',
      resource: backupRoot,
      run: async () => {
        await rm(backupRoot, { recursive: true, force: true });
      },
    },
  );

  return {
    scenario: {
      stamp,
      manifest: manifest!,
      assetsRoot,
      storageRoot,
      backupRoot,
      expectedMediaNames,
      categoryIds,
      brandIds,
      productIds,
      variantIds,
      warehouseIds,
    },
    cleanupActions,
  };
}

export async function runRealGatewayCleanup(
  actions: CleanupAction[],
): Promise<CleanupFailure[]> {
  return runCleanupActions(actions);
}
