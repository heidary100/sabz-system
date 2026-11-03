import { ProductCondition, ProductStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { recomputeProductMinPrice } from '../src/modules/products/min-price';
import { PublicCatalogService } from '../src/modules/products/public-catalog.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.setTimeout(60_000);

/**
 * SS-264 frozen regression instruments (issue #307) — the CI oracle.
 *
 * Both instruments committed with the fix (audit §A.3, frozen 2026-10-24)
 * run here against a HERMETIC mini-catalog with fixed identities
 * (`SS264-` SKUs / `prod-ss264-` slugs), so the oracle is deterministic and
 * independent of the dev catalog. Every fixture documents which real
 * dev-catalog product (or noise class) it mirrors:
 *
 *   - brand وریتی/ANKER + «ورتی»/«Anker» queries reproduce the audit's
 *     false-positive mechanisms (party/`speaker`/`ank`-text noise);
 *   - the battery mirrors audit §A.3's 32-query recall composition.
 *
 * Scoring (precision-labels.json): P@5 = |top5 ∩ relevant| / min(5, |top5|);
 * empty top5 scores 0; average ≥ 0.9. Relevance here is the seeded identity
 * set per query — the human labels of 2026-11-01 translated to the fixture
 * universe. The dev-catalog version of the same instruments lives in
 * scripts/search-instruments.ts (report-only PR evidence).
 *
 * Known frozen consequence (user-approved 2026-11-01): the «ورتی» query (a
 * 4-cp typo of the 5-cp brand «وریتی») returns ZERO results — its relevant
 * matches sat in the same 0.4–0.6 trigram band as the پارتی/ویوارکس false
 * positives (measured: FP 0.600 > relevant 0.400), so no threshold
 * separates them and the N=6 gate removes the token from fuzzy entirely.
 */
describe('SS-264 search precision regression instruments', () => {
  let prisma: PrismaService;
  let catalog: PublicCatalogService;

  const FIXTURES = join(__dirname, 'fixtures', 'ss264-search');

  interface BatteryQuery {
    q: string;
    expect: 'hits' | 'zero';
    class: string;
  }

  interface LabelQuery {
    q: string;
    v0Score?: number;
    relevanceRule: {
      nameContains?: string;
      nameEnContains?: string;
      auxContains?: string;
      brandName?: string;
    };
  }

  /** Deterministic fixture identities. */
  const SKUS = {
    goshi: 'SS264-GOSHI',
    kibord: 'SS264-KIBORD',
    kibord2: 'SS264-KIBORD-2',
    maus: 'SS264-MAUS',
    sharzh: 'SS264-SHARZH',
    pavrbank: 'SS264-PAVRBANK',
    spykr: 'SS264-SPYKR',
    hard: 'SS264-HARD',
    flash: 'SS264-FLASH',
    hedfon: 'SS264-HEDFON',
    saat: 'SS264-SAAT',
    laptop: 'SS264-LAPTOP',
    mobail: 'SS264-MOBAIL',
    vrity3: 'SS264-VRITY-3',
    glin: 'SS264-GLIN',
    prdo: 'SS264-PRDO',
    pwrl: 'SS264-PWRL',
    orco: 'SS264-ORCO',
    viva: 'SS264-VIVA',
    vityen: 'SS264-VITYEN',
    anker2: 'SS264-ANKER-2',
    parti1: 'SS264-PARTI-1',
    parti2: 'SS264-PARTI-2',
    parti3: 'SS264-PARTI-3',
    parti4: 'SS264-PARTI-4',
    partiAux: 'SS264-PARTI-AUX',
    noise: 'SS264-NOISE-1',
    ssd1: 'SS264-SSD-1',
    ssd2: 'SS264-SSD-2',
    // Battery SKU probes reuse the live-catalog identities verbatim so one
    // battery file serves both environments.
    battery1: 'GNJUMPSTR',
    battery2: 'WOO-18794',
    battery3: 'WOO-29613',
  } as const;

  interface Spec {
    key: string;
    name: string;
    nameEn?: string;
    subtitle?: string;
    focusKeyword?: string;
    brandSlug?: string;
    sku: string;
  }

  const BRANDS = [
    { slug: 'brand-ss264-vrity', name: 'وریتی' },
    { slug: 'brand-ss264-anker', name: 'ANKER' },
    { slug: 'brand-ss264-glin', name: 'گرین لاین', nameEn: 'Green Lion' },
    { slug: 'brand-ss264-prdo', name: 'پرودو', nameEn: 'Porodo' },
    { slug: 'brand-ss264-pwrl', name: 'پاورولوژی', nameEn: 'Powerology' },
    { slug: 'brand-ss264-orco', name: 'اوریکو', nameEn: 'Orico' },
    { slug: 'brand-ss264-viva', name: 'ویوارکس', nameEn: 'vivarex' },
    { slug: 'brand-ss264-proone', name: 'proone' },
    { slug: 'brand-ss264-verity', name: 'Verity' },
  ];

  const PRODUCTS: Spec[] = [
    // Battery: Persian common nouns
    { key: 'goshi', name: 'گوشی آزمون سبز مدل G-1', sku: SKUS.goshi },
    { key: 'mobail', name: 'گوشی موبایل آزمون سبز', sku: SKUS.mobail },
    { key: 'kibord', name: 'کیبورد آزمون سبز مدل K-1', sku: SKUS.kibord },
    { key: 'kibord2', name: 'کیبورد مخصوص بازی وریتی مدل V-KB6132', sku: SKUS.kibord2 },
    { key: 'maus', name: 'ماوس آزمون سبز مدل M-1', sku: SKUS.maus },
    { key: 'sharzh', name: 'شارژر آزمون سبز ۲۵ وات', sku: SKUS.sharzh },
    { key: 'pavrbank', name: 'پاوربانک آزمون سبز ۲۰۰۰۰', sku: SKUS.pavrbank },
    { key: 'spykr', name: 'اسپیکر آزمون سبز مدل S-1', sku: SKUS.spykr },
    { key: 'hard', name: 'هارد آزمون سبز ۱ ترابایت', sku: SKUS.hard },
    { key: 'flash', name: 'فلش مموری آزمون سبز ۱۶ گیگ', sku: SKUS.flash },
    { key: 'hedfon', name: 'هدفون آزمون سبز مدل H-1', sku: SKUS.hedfon },
    { key: 'saat', name: 'ساعت هوشمند آزمون سبز مدل W-1', sku: SKUS.saat },
    { key: 'laptop', name: 'لپ تاپ آزمون گیمینگ سبز', sku: SKUS.laptop },
    // Battery: Persian brands (brand rows + names)
    { key: 'vrity1', name: 'اسپیکر بلوتوثی قابل حمل وریتی مدل V-PS7028 BT', brandSlug: 'brand-ss264-vrity', sku: SKUS.battery3 },
    { key: 'vrity2', name: 'اسپیکر بلوتوثی قابل حمل وریتی مدل V-PS7025 BT', brandSlug: 'brand-ss264-vrity', sku: SKUS.vrity3 },
    { key: 'vrity3', name: 'اسپیکر قابل حمل وریتی مدل PS-7026BT', brandSlug: 'brand-ss264-vrity', sku: SKUS.vrity3 + '-B' },
    { key: 'glin', name: 'پمپ باد شارژی گرین لاین مدل GNHYINFTRBK', brandSlug: 'brand-ss264-glin', sku: SKUS.glin },
    { key: 'prdo', name: 'هندزفری بلوتوثی پرودو مدل PD8002WH', nameEn: 'Porodo Wireless Earbuds Pro 3 ANC PD8002WH', brandSlug: 'brand-ss264-prdo', sku: SKUS.prdo },
    // Mirrors live-catalog density: the «Porodo» top-5 must be filled by
    // contains-tier («پرودو») products so brand-fuzzy noise (proone /
    // Powerology ≈ 'porodo') stays out of it, as on the real catalog.
    { key: 'prdo2', name: 'ماشین اصلاح موی صورت و بدن شارژی پرودو مدل LFST112', brandSlug: 'brand-ss264-prdo', sku: 'SS264-PRDO-2' },
    { key: 'prdo3', name: 'هولدر وکیومی پرودو مدل PBCT080BK', nameEn: 'Porodo Blue Clingx MagSafe Suction Holder PBCT080BK', brandSlug: 'brand-ss264-prdo', sku: 'SS264-PRDO-3' },
    { key: 'prdo4', name: 'پاوربانک خورشیدی ۴ پنل ۲۰ وات پرودو مدل PDPBFCH070BK', brandSlug: 'brand-ss264-prdo', sku: 'SS264-PRDO-4' },
    { key: 'pwrl', name: 'شارژر دیواری پاورولوژی مدل P-45W', brandSlug: 'brand-ss264-pwrl', sku: SKUS.pwrl },
    { key: 'orco', name: 'هارد اکسترنال اوریکو مدل 2588', brandSlug: 'brand-ss264-orco', sku: SKUS.orco },
    { key: 'viva', name: 'ست ابزار دستی ویوارکس مدل VROOO8-HTK هشت پارچه با کیف حمل', brandSlug: 'brand-ss264-viva', sku: SKUS.viva },
    { key: 'vityen', name: 'فن رومیزی Verity مدل V-90', brandSlug: 'brand-ss264-verity', sku: SKUS.vityen },
    // Precision exemplars: the ANKER pair + the audit's noise classes
    { key: 'anker1', name: 'هندزفری بلوتوثی انکر مدل R50i NC A3959', brandSlug: 'brand-ss264-anker', sku: SKUS.battery2 },
    { key: 'anker2', name: 'هندزفری بلوتوثی انکر مدل R50i A3949', brandSlug: 'brand-ss264-anker', sku: SKUS.anker2 },
    // Mirrors dev WOO-… «جامپ استارتر»: pre-gate it fuzz-matched «Anker».
    { key: 'jump', name: 'جامپ استارتر و پمپ باد گرین لاین مدل GNJUMPSTR', brandSlug: 'brand-ss264-glin', sku: SKUS.battery1 },
    // Mirrors the dev-catalog `speaker`-text noise class (nameEn/focusKeyword
    // "… Bluetooth Speaker"), which fuzz-matched «Anker» pre-gate.
    { key: 'spk-noise-1', name: 'اسپیکر بلوتوثی XP مدل XP-SP258A', nameEn: 'XP XP-SP258A Portable Bluetooth Speaker', focusKeyword: 'اسپیکر,بلوتوث,speaker,verity', sku: 'SS264-SPK-N1' },
    { key: 'spk-noise-2', name: 'اسپیکر بلوتوثی XP مدل XP-SP259A', nameEn: 'XP XP-SP259A Portable Bluetooth Speaker', focusKeyword: 'اسپیکر,بلوتوث,speaker,verity', sku: 'SS264-SPK-N2' },
    { key: 'spk-noise-3', name: 'اسپیکر بلوتوثی XP مدل XP-SP260A', nameEn: 'XP XP-SP260A Portable Bluetooth Speaker', focusKeyword: 'اسپیکر,بلوتوث,speaker,verity', sku: 'SS264-SPK-N3' },
    // پارتی precision set: name-tier + aux-tier (Koluman analogue whose
    // operator focusKeyword says «پارتی باکس») — all relevant per the labels.
    { key: 'parti1', name: 'اسپیکر پارتی وایب پرووان مدل PSB4976', brandSlug: 'brand-ss264-proone', sku: SKUS.parti1 },
    { key: 'parti2', name: 'اسپیکر پارتی باکس وریتی مدل PS2208', sku: SKUS.parti2 },
    { key: 'parti3', name: 'اسپیکر پارتی باکس لیتو مدل Party Box 500', sku: SKUS.parti3 },
    { key: 'parti4', name: 'اسپیکر پارتی باکس لیتو مدل Party Box 1000', sku: SKUS.parti4 },
    { key: 'partiAux', name: 'اسپیکر بلوتوثی قابل حمل کلومن مدل MUSIC BOX 100', focusKeyword: 'اسپیکر,موزیک باکس,پارتی باکس,کلومن', sku: SKUS.partiAux },
    // Mirrors dev WOO-18162 «عینک هوشمند ورزشی»: pre-gate ورتی-noise.
    { key: 'noise1', name: 'عینک هوشمند ورزشی پرودو مدل HORIZON PDLFST806', brandSlug: 'brand-ss264-prdo', sku: SKUS.noise },
    // SSD precision set
    { key: 'ssd1', name: 'حافظه SSD (اس اس دی) اینترنال پتریوت مدل P220 ظرفیت ۱ ترابایت', nameEn: 'SSD P220 1TB', sku: SKUS.ssd1 },
    { key: 'ssd2', name: 'حافظه SSD (اس اس دی) اکسترنال پتریوت مدل P210 ظرفیت ۲۵۶ گیگ', nameEn: 'SSD P210 256GB', sku: SKUS.ssd2 },
  ];

  const createdProductIds: string[] = [];
  const createdBrandIds: string[] = [];
  let categoryId = '';

  const idByKey = new Map<string, string>();
  const skuToProductId = new Map<string, string>();

  async function seed(): Promise<void> {
    const category = await prisma.category.create({
      data: { name: 'دسته آزمون SS264', slug: 'cat-ss264' },
    });
    categoryId = category.id;
    const brandIds = new Map<string, string>();
    for (const brand of BRANDS) {
      const row = await prisma.brand.create({
        data: { name: brand.name, slug: brand.slug, nameEn: brand.nameEn ?? null },
      });
      createdBrandIds.push(row.id);
      brandIds.set(brand.slug, row.id);
    }
    for (const spec of PRODUCTS) {
      const product = await prisma.product.create({
        data: {
          name: spec.name,
          slug: `prod-ss264-${spec.key}`,
          nameEn: spec.nameEn ?? null,
          subtitle: spec.subtitle ?? null,
          focusKeyword: spec.focusKeyword ?? null,
          brandId: spec.brandSlug ? (brandIds.get(spec.brandSlug) ?? null) : null,
          categoryId,
          condition: ProductCondition.NEW,
          status: ProductStatus.PUBLISHED,
          sourceSystem: 'SS264FIXTURE',
          sourceId: spec.key,
          sourceType: 'simple',
          variants: { create: { sku: spec.sku, name: 'متغیر ۱', price: '1000000', priceStatus: 'PRICED' } },
        },
        include: { variants: { select: { id: true, sku: true } } },
      });
      createdProductIds.push(product.id);
      idByKey.set(spec.key, product.id);
      for (const variant of product.variants) {
        skuToProductId.set(variant.sku, product.id);
      }
      // Raw fixture writes bypass the service writer — keep minPrice fresh.
      await recomputeProductMinPrice(prisma, product.id);
    }
  }

  async function top5(q: string): Promise<string[]> {
    const result = await catalog.listProducts({ q, limit: 5 });
    return result.items.map((item) => item.id);
  }

  /** Resolves the human relevance rule over the SEEDED universe. */
  function relevantIdsFor(rule: LabelQuery['relevanceRule']): string[] {
    const specs = PRODUCTS.filter((spec) => {
      if (rule.brandName && BRANDS.find((b) => b.slug === spec.brandSlug)?.name === rule.brandName) {
        return true;
      }
      if (rule.nameContains && spec.name.includes(rule.nameContains)) return true;
      if (rule.nameEnContains && (spec.nameEn ?? '').toLowerCase().includes(rule.nameEnContains)) {
        return true;
      }
      if (rule.auxContains && (spec.focusKeyword ?? '').includes(rule.auxContains)) return true;
      return false;
    });
    return specs.map((spec) => idByKey.get(spec.key)!).filter(Boolean);
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    catalog = new PublicCatalogService(prisma, new PricingService(prisma));
    // Rerun idempotence: drop any prior SS264 fixtures (inventory rows would
    // block variant deletion, so they go first — none are created here, but
    // a crashed earlier run must not wedge the seed).
    const stale = await prisma.product.findMany({
      where: { slug: { startsWith: 'prod-ss264-' } },
      select: { id: true },
    });
    const staleIds = stale.map((row) => row.id);
    if (staleIds.length > 0) {
      const staleVariants = await prisma.productVariant.findMany({
        where: { productId: { in: staleIds } },
        select: { id: true },
      });
      await prisma.inventoryItem.deleteMany({
        where: { variantId: { in: staleVariants.map((v) => v.id) } },
      });
      await prisma.product.deleteMany({ where: { id: { in: staleIds } } });
    }
    await prisma.brand.deleteMany({ where: { slug: { startsWith: 'brand-ss264-' } } });
    await prisma.category.deleteMany({ where: { slug: 'cat-ss264' } });
    await seed();
  });

  afterAll(async () => {
    const variants = await prisma.productVariant.findMany({
      where: { productId: { in: createdProductIds } },
      select: { id: true },
    });
    await prisma.inventoryItem.deleteMany({
      where: { variantId: { in: variants.map((v) => v.id) } },
    });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('recall battery: every hits-query returns results, nonsense stays zero', async () => {
    const battery = JSON.parse(
      readFileSync(join(FIXTURES, 'recall-battery.json'), 'utf8'),
    ) as { queries: BatteryQuery[] };
    const failures: string[] = [];
    for (const { q, expect: expectation } of battery.queries) {
      const { total } = await catalog.listProducts({ q, limit: 1 });
      const ok = expectation === 'hits' ? total >= 1 : total === 0;
      if (!ok) failures.push(`${q} (expect ${expectation}, got ${total})`);
    }
    expect(failures).toEqual([]);
  });

  it('ورتی: the 4-cp typo returns nothing (approved gate consequence)', async () => {
    // The mini-catalog mirrors the real mechanism: وریتی text everywhere but
    // no literal «ورتی» substring, and the token is below the fuzzy gate.
    const { total, items } = await catalog.listProducts({ q: 'ورتی' });
    expect(total).toBe(0);
    expect(items).toHaveLength(0);
  });

  it('Anker: top-5 is exactly the ANKER products (no جامپ استارتر / speaker noise)', async () => {
    const { total } = await catalog.listProducts({ q: 'Anker', limit: 5 });
    const ids = await top5('Anker');
    const ankerIds = [idByKey.get('anker1'), idByKey.get('anker2')];
    expect(total).toBe(2);
    expect([...ids].sort()).toEqual([...ankerIds].sort());
  });

  it('پارتی: top-5 excludes the ورتی-noise classes and covers the party set', async () => {
    const ids = await top5('پارتی');
    const relevant = new Set(
      ['parti1', 'parti2', 'parti3', 'parti4', 'partiAux'].map((k) => idByKey.get(k)),
    );
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids) expect(relevant.has(id)).toBe(true);
    expect(ids).not.toContain(idByKey.get('viva'));
    expect(ids).not.toContain(idByKey.get('noise1'));
  });

  it('labeled precision set: average P@5 ≥ 0.9 over the seeded universe', async () => {
    const labels = JSON.parse(
      readFileSync(join(FIXTURES, 'precision-labels.json'), 'utf8'),
    ) as { queries: LabelQuery[] };
    const universe = new Set(createdProductIds);
    const scores: { q: string; p: number }[] = [];
    for (const { q, relevanceRule } of labels.queries) {
      const ids = await top5(q);
      // Score within the seeded fixture universe: foreign rows from other
      // spec files sharing this database are not part of this instrument.
      const relevant = new Set(relevantIdsFor(relevanceRule));
      const scoped = ids.filter((id) => universe.has(id));
      const hits = scoped.filter((id) => relevant.has(id)).length;
      const p = scoped.length === 0 ? 0 : hits / Math.min(5, scoped.length);
      scores.push({ q, p });
    }
    const average = scores.reduce((sum, s) => sum + s.p, 0) / scores.length;
    expect(average).toBeGreaterThanOrEqual(0.9);
  });
});
