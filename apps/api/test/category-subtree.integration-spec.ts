import { ProductCondition, ProductStatus } from '@prisma/client';
import type { CatalogCategoryNode } from '@sabz/types';
import { PrismaService } from '../src/common/database/prisma.service';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { PricingService } from '../src/modules/pricing/pricing.service';

jest.setTimeout(30_000);

/**
 * Category subtree reads and roll-up counts (SS-205).
 *
 * The listing `category` filter matches the whole subtree, and tree counts
 * accumulate descendants over visible edges only.
 */
describe('Category subtree reads and roll-up counts (SS-205)', () => {
  let prisma: PrismaService;
  let catalog: PublicCatalogService;

  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const actorId = '77777777-7777-4377-8777-777777777777';

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createCategory(
    slug: string,
    name: string,
    parentId: string | null = null,
    isVisible = true,
  ): Promise<{ id: string }> {
    const category = await prisma.category.create({
      data: { name, slug, parentId, isVisible },
    });
    createdCategoryIds.push(category.id);
    return { id: category.id };
  }

  async function createPublishedProduct(categoryId: string): Promise<void> {
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: { name: `برند ${suffix}`, slug: `brand-cs-${suffix}` },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.findUniqueOrThrow({
      where: { id: categoryId },
    });
    const product = await prisma.product.create({
      data: {
        name: `محصول ${suffix}`,
        slug: `prod-cs-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: ProductStatus.PUBLISHED,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new PublicCatalogService(prisma, new PricingService(prisma));
  });

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
  });

  it('filters listings by subtree and rolls counts up visible edges', async () => {
    const suffix = uniqueSuffix();
    const root = await createCategory(`root-${suffix}`, `ریشه ${suffix}`);
    const mid = await createCategory(
      `mid-${suffix}`,
      `میانی ${suffix}`,
      root.id,
    );
    const leaf = await createCategory(
      `leaf-${suffix}`,
      `برگ ${suffix}`,
      mid.id,
    );
    const hidden = await createCategory(
      `hidden-${suffix}`,
      `مخفی ${suffix}`,
      root.id,
      false,
    );
    await createPublishedProduct(leaf.id);
    await createPublishedProduct(leaf.id);
    await createPublishedProduct(mid.id);
    await createPublishedProduct(hidden.id);

    // Subtree filter: root sees its three visible products (hidden excluded
    // from neither listing nor assertion here — listing has no visibility
    // gate, so the hidden product IS listed; the tree below excludes it).
    const rootPage = await catalog.listProducts({
      page: 1,
      limit: 50,
      category: `root-${suffix}`,
    });
    expect(rootPage.total).toBe(4);

    const midPage = await catalog.listProducts({
      page: 1,
      limit: 50,
      category: `mid-${suffix}`,
    });
    expect(midPage.total).toBe(3);

    const leafPage = await catalog.listProducts({
      page: 1,
      limit: 50,
      category: `leaf-${suffix}`,
    });
    expect(leafPage.total).toBe(2);

    const missing = await catalog.listProducts({
      page: 1,
      limit: 50,
      category: `nope-${suffix}`,
    });
    expect(missing.total).toBe(0);

    // Roll-up: root and mid accumulate visible descendants only.
    const tree = await catalog.getCategoryTree();
    const find = (
      nodes: CatalogCategoryNode[],
      slug: string,
    ): CatalogCategoryNode | undefined => {
      for (const node of nodes) {
        if (node.slug === slug) {
          return node;
        }
        const nested = find(node.children, slug);
        if (nested) {
          return nested;
        }
      }
      return undefined;
    };
    expect(find(tree, `root-${suffix}`)?.publishedProductCount).toBe(3);
    expect(find(tree, `mid-${suffix}`)?.publishedProductCount).toBe(3);
    expect(find(tree, `leaf-${suffix}`)?.publishedProductCount).toBe(2);
    expect(JSON.stringify(tree)).not.toContain(`hidden-${suffix}`);
  });
});
