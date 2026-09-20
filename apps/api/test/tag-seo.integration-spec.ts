import { ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { TagsService } from '../src/modules/products/tags.service';

jest.setTimeout(30_000);

/**
 * Tags/SEO metadata database integration (SS-203).
 *
 * Covers key-normalized tag identity, ordered assignment, delete guards,
 * product/brand metadata columns, and public detail exposure.
 */
describe('Tags/SEO database integration (SS-203)', () => {
  let prisma: PrismaService;
  let tags: TagsService;
  let catalog: PublicCatalogService;

  const createdTagIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const actorId = '55555555-5555-4355-8555-555555555555';

  function uniqueSuffix(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async function createProduct(
    overrides: {
      status?: ProductStatus;
      nameEn?: string;
      subtitle?: string;
      metaTitle?: string;
      metaDescription?: string;
      focusKeyword?: string;
    } = {},
  ): Promise<{ id: string }> {
    const suffix = uniqueSuffix();
    const brand = await prisma.brand.create({
      data: {
        name: `برند ${suffix}`,
        slug: `brand-tg-${suffix}`,
        nameEn: `BrandEn-${suffix}`,
      },
    });
    createdBrandIds.push(brand.id);
    const category = await prisma.category.create({
      data: { name: `دسته ${suffix}`, slug: `cat-tg-${suffix}` },
    });
    createdCategoryIds.push(category.id);
    const product = await prisma.product.create({
      data: {
        name: `محصول ${suffix}`,
        slug: `prod-tg-${suffix}`,
        brandId: brand.id,
        categoryId: category.id,
        condition: ProductCondition.NEW,
        status: overrides.status ?? ProductStatus.DRAFT,
        nameEn: overrides.nameEn ?? null,
        subtitle: overrides.subtitle ?? null,
        metaTitle: overrides.metaTitle ?? null,
        metaDescription: overrides.metaDescription ?? null,
        focusKeyword: overrides.focusKeyword ?? null,
        createdBy: actorId,
      },
    });
    createdProductIds.push(product.id);
    return { id: product.id };
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    tags = new TagsService(prisma);
    catalog = new PublicCatalogService(prisma);
  });

  afterAll(async () => {
    await prisma.productTag.deleteMany({
      where: { productId: { in: createdProductIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
    await prisma.tag.deleteMany({ where: { id: { in: createdTagIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await prisma.$disconnect();
  });

  it('converges Persian spelling variants to one tag (dataset behavior)', async () => {
    const suffix = uniqueSuffix();
    const first = await tags.upsertTag('لپ تاپ', `laptop-${suffix}`);
    createdTagIds.push(first.id);
    const second = await tags.upsertTag('لپتاپ', `laptop-alt-${suffix}`);
    const third = await tags.upsertTag('لپ‌تاپ', `laptop-zwnj-${suffix}`);

    // All three spellings resolve to the first-seen row; slug never renames.
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(second.slug).toBe(`laptop-${suffix}`);
    expect(
      await prisma.tag.count({ where: { slug: `laptop-${suffix}` } }),
    ).toBe(1);
  });

  it('assigns ordered tags and rejects duplicates', async () => {
    const { id } = await createProduct();
    const suffix = uniqueSuffix();

    await tags.assignTag(id, 'اسپیکر', `speaker-${suffix}`, 2);
    await tags.assignTag(id, 'بلوتوث', `bluetooth-${suffix}`, 1);

    const listed = await tags.listProductTags(id);
    expect(listed.map((tag) => tag.name)).toEqual(['بلوتوث', 'اسپیکر']);

    await expect(
      tags.assignTag(id, 'اسپیکر', `speaker-${suffix}`, 3),
    ).rejects.toMatchObject({ status: 409 });

    const tagIds = (
      await prisma.tag.findMany({
        where: { slug: { in: [`speaker-${suffix}`, `bluetooth-${suffix}`] } },
        select: { id: true },
      })
    ).map((tag) => tag.id);
    createdTagIds.push(...tagIds);
  });

  it('guards tag deletion while assigned', async () => {
    const { id } = await createProduct();
    const tag = await tags.upsertTag('حذف‌نشدنی', `nodelete-${uniqueSuffix()}`);
    createdTagIds.push(tag.id);
    await tags.assignTag(id, 'حذف‌نشدنی', tag.slug);

    await expect(tags.deleteTag(tag.id)).rejects.toMatchObject({ status: 409 });

    await tags.unassignTag(id, tag.id);
    await expect(tags.deleteTag(tag.id)).resolves.toBeUndefined();
    createdTagIds.splice(createdTagIds.indexOf(tag.id), 1);
  });

  it('stores brand and product metadata columns', async () => {
    const { id } = await createProduct({
      nameEn: 'Sample Product EN',
      subtitle: 'زیرعنوان نمونه',
      metaTitle: 'عنوان سئو',
      metaDescription: 'توضیح سئو',
      focusKeyword: 'کلیدواژه',
    });

    const row = await prisma.product.findUniqueOrThrow({ where: { id } });
    expect(row.nameEn).toBe('Sample Product EN');
    expect(row.subtitle).toBe('زیرعنوان نمونه');
    expect(row.metaTitle).toBe('عنوان سئو');
    expect(row.metaDescription).toBe('توضیح سئو');
    expect(row.focusKeyword).toBe('کلیدواژه');

    const brand = await prisma.brand.findFirstOrThrow({
      where: { id: { in: createdBrandIds } },
      orderBy: { createdAt: 'desc' },
    });
    expect(brand.nameEn).toMatch(/^BrandEn-/);
  });

  it('exposes tags, meta, and names on the public detail DTO', async () => {
    const { id } = await createProduct({
      status: ProductStatus.PUBLISHED,
      nameEn: 'Detail EN',
      subtitle: 'زیرعنوان',
      metaTitle: 'متا تایتل',
      metaDescription: 'متا دیسکریپشن',
    });
    const slug = (
      await prisma.product.findUniqueOrThrow({
        where: { id },
        select: { slug: true },
      })
    ).slug;
    const suffix = uniqueSuffix();
    await tags.assignTag(id, 'گیمینگ', `gaming-${suffix}`, 1);
    const tagRow = await prisma.tag.findUniqueOrThrow({
      where: { slug: `gaming-${suffix}` },
    });
    createdTagIds.push(tagRow.id);

    const detail = await catalog.getProductBySlug(slug);
    expect(detail.nameEn).toBe('Detail EN');
    expect(detail.subtitle).toBe('زیرعنوان');
    expect(detail.metaTitle).toBe('متا تایتل');
    expect(detail.metaDescription).toBe('متا دیسکریپشن');
    expect(detail.tags).toEqual([{ name: 'گیمینگ', slug: `gaming-${suffix}` }]);
    // focusKeyword stays internal (search index only, SS-216).
    expect(detail).not.toHaveProperty('focusKeyword');
  });
});
