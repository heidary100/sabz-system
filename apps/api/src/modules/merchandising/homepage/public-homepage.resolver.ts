import { Injectable } from '@nestjs/common';
import type {
  BlogPostCardDto,
  CatalogCategoryNode,
  CatalogProductCardDto,
  CatalogRefDto,
  HomepageSnapshot,
  HomepageSnapshotSection,
  MerchCampaignSnapshot,
  MerchCtaTarget,
  PublishedCampaignCopy,
  PublishedCategoryTile,
  PublishedHeroSlide,
  PublishedHomepageSection,
} from '@sabz/types';
import { PrismaService } from '../../../common/database/prisma.service';
import { BlogService } from '../../blog/blog.service';
import {
  CATEGORY_COVER_MAX,
  PublicCatalogService,
} from '../../products/public-catalog.service';
import { ListCatalogProductsQueryDto } from '../../products/dto';
import {
  validateCampaignLifecycleEligibility,
  type CampaignLifecycleState,
} from './campaign-eligibility';

export const PUBLIC_MERCH_MEDIA_URL_PREFIX = '/api/v1/catalog/merch-media';

interface PublicMediaAsset {
  url: string;
  thumbnailUrl: string | null;
}

interface ResolveContext {
  products: Map<string, CatalogProductCardDto>;
  categories: Map<string, PublishedCategoryTile>;
  brands: Map<string, CatalogRefDto>;
  media: Map<string, PublicMediaAsset>;
  campaigns: Map<string, CampaignLifecycleState>;
  blogById: Map<string, BlogPostCardDto>;
  latestBlog: BlogPostCardDto[];
}

interface ReferenceSets {
  productIds: Set<string>;
  categoryIds: Set<string>;
  brandIds: Set<string>;
  mediaIds: Set<string>;
  campaignIds: Set<string>;
  manualBlogIds: Set<string>;
  latestBlogLimit: number;
}

/**
 * Resolves an immutable homepage publication snapshot into the public,
 * storefront-ready contract (Task 05.5).
 *
 * Campaign presentation is read only from the snapshot. Catalog prices, stock,
 * visibility, media eligibility, category covers, and blog publication state are
 * resolved live through the existing public domain services.
 */
@Injectable()
export class PublicHomepageResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicCatalog: PublicCatalogService,
    private readonly blog: BlogService,
  ) {}

  async resolve(
    snapshot: HomepageSnapshot,
    now: Date = new Date(),
  ): Promise<PublishedHomepageSection[]> {
    const context = await this.loadContext(snapshot);
    const visible = snapshot.sections.filter((section) => section.isVisible);
    const resolved = await Promise.all(
      visible.map((section) => this.resolveSection(section, context, now)),
    );
    return resolved.filter(
      (section): section is PublishedHomepageSection => section !== null,
    );
  }

  private async loadContext(snapshot: HomepageSnapshot): Promise<ResolveContext> {
    const refs = collectReferences(snapshot.sections);
    const [cards, tree, brands, media, campaigns, manualPosts, latestPosts] =
      await Promise.all([
        this.publicCatalog.getVisibleCardsByIds([...refs.productIds]),
        this.publicCatalog.getCategoryTree(),
        refs.brandIds.size > 0
          ? this.prisma.brand.findMany({
              where: { id: { in: [...refs.brandIds] }, deletedAt: null },
              select: { id: true, name: true, slug: true },
            })
          : Promise.resolve([]),
        refs.mediaIds.size > 0
          ? this.prisma.merchMedia.findMany({
              where: {
                id: { in: [...refs.mediaIds] },
                deletedAt: null,
                publishedAt: { not: null },
              },
              select: { id: true, thumbnailKey: true },
            })
          : Promise.resolve([]),
        refs.campaignIds.size > 0
          ? this.prisma.merchCampaign.findMany({
              where: { id: { in: [...refs.campaignIds] } },
              select: {
                id: true,
                isEnabled: true,
                archivedAt: true,
                startsAt: true,
                endsAt: true,
              },
            })
          : Promise.resolve([]),
        this.blog.getPublishedCardsByIds([...refs.manualBlogIds]),
        refs.latestBlogLimit > 0
          ? this.blog.getLatestPublishedCards(refs.latestBlogLimit)
          : Promise.resolve([]),
      ]);

    const categories = await this.loadCategories(tree, refs.categoryIds);
    return {
      products: new Map(cards.map((card) => [card.id, card])),
      categories,
      brands: new Map(
        brands.map((brand) => [
          brand.id,
          { name: brand.name, slug: brand.slug } satisfies CatalogRefDto,
        ]),
      ),
      media: new Map(
        media.map((asset) => [
          asset.id,
          {
            url: `${PUBLIC_MERCH_MEDIA_URL_PREFIX}/${asset.id}`,
            thumbnailUrl:
              asset.thumbnailKey !== null
                ? `${PUBLIC_MERCH_MEDIA_URL_PREFIX}/${asset.id}/thumbnail`
                : null,
          } satisfies PublicMediaAsset,
        ]),
      ),
      campaigns: new Map(
        campaigns.map((campaign) => [
          campaign.id,
          {
            isEnabled: campaign.isEnabled,
            archivedAt: campaign.archivedAt,
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
          } satisfies CampaignLifecycleState,
        ]),
      ),
      blogById: new Map(manualPosts.map((post) => [post.id, post])),
      latestBlog: latestPosts,
    };
  }

  private async loadCategories(
    tree: CatalogCategoryNode[],
    referencedIds: Set<string>,
  ): Promise<Map<string, PublishedCategoryTile>> {
    const base = new Map<string, PublishedCategoryTile>();
    const visit = (nodes: CatalogCategoryNode[]): void => {
      for (const node of nodes) {
        base.set(node.id, {
          id: node.id,
          name: node.name,
          slug: node.slug,
          publishedProductCount: node.publishedProductCount,
          coverUrl: null,
        });
        visit(node.children);
      }
    };
    visit(tree);

    const referencedSlugs = [...new Set(
      [...referencedIds]
        .map((id) => base.get(id)?.slug)
        .filter((slug): slug is string => slug !== undefined),
    )];
    const coverBySlug = new Map<string, string | null>();
    for (let index = 0; index < referencedSlugs.length; index += CATEGORY_COVER_MAX) {
      const chunk = referencedSlugs.slice(index, index + CATEGORY_COVER_MAX);
      const covers = await this.publicCatalog.getCategoryCovers(chunk.join(','));
      for (const cover of covers) {
        coverBySlug.set(cover.slug, cover.imageUrl);
      }
    }
    for (const tile of base.values()) {
      if (coverBySlug.has(tile.slug)) {
        tile.coverUrl = coverBySlug.get(tile.slug) ?? null;
      }
    }
    return base;
  }

  private async resolveSection(
    section: HomepageSnapshotSection,
    context: ResolveContext,
    now: Date,
  ): Promise<PublishedHomepageSection | null> {
    switch (section.type) {
      case 'HERO_CAROUSEL':
        return this.resolveHero(section, context, now);
      case 'TRUST_STRIP':
        return section.settings.items.length > 0
          ? {
              key: section.key,
              type: 'TRUST_STRIP',
              order: section.order,
              items: section.settings.items.map((item) => ({ ...item })),
            }
          : null;
      case 'CATEGORY_DISCOVERY':
        return this.resolveCategoryDiscovery(section, context, now);
      case 'OFFER_STRIP':
        return this.resolveOfferStrip(section, context, now);
      case 'CATEGORY_SPOTLIGHT':
        return this.resolveCategorySpotlight(section, context, now);
      case 'READY_TO_SHIP':
        return this.resolveReadyToShip(section);
      case 'PRODUCT_RAIL':
        return this.resolveProductRail(section, context, now);
      case 'BRAND_SHOWCASE':
        return this.resolveBrandShowcase(section, context, now);
      case 'BLOG_FEATURE':
        return this.resolveBlogFeature(section, context);
      default: {
        const exhaustive: never = section;
        return exhaustive;
      }
    }
  }

  private resolveHero(
    section: Extract<HomepageSnapshotSection, { type: 'HERO_CAROUSEL' }>,
    context: ResolveContext,
    now: Date,
  ): PublishedHomepageSection | null {
    const slides = section.settings.campaigns
      .filter((campaign) => this.isCampaignEligible(campaign.sourceCampaignId, context, now))
      .map((campaign) => this.resolveHeroSlide(campaign, context));
    if (slides.length === 0) return null;
    return {
      key: section.key,
      type: 'HERO_CAROUSEL',
      order: section.order,
      slides,
    };
  }

  private resolveHeroSlide(
    campaign: MerchCampaignSnapshot,
    context: ResolveContext,
  ): PublishedHeroSlide {
    const media = campaign.media.flatMap((item) => {
      const asset = context.media.get(item.mediaId);
      return asset ? [{ item, asset }] : [];
    });
    const desktop = media.find((entry) => entry.item.slot === 'HERO_DESKTOP');
    const mobile = media.find((entry) => entry.item.slot === 'HERO_MOBILE');
    const primary = desktop ?? mobile;
    const images = [...new Set([
      ...campaign.productIds.flatMap((id) => {
        const card = context.products.get(id);
        const image = card?.primaryThumbnailUrl ?? card?.primaryImageUrl;
        return image ? [image] : [];
      }),
      ...campaign.categoryIds.flatMap((id) => {
        const cover = context.categories.get(id)?.coverUrl;
        return cover ? [cover] : [];
      }),
    ])].slice(0, 3);

    return {
      campaignType: campaign.type,
      eyebrowFa: campaign.eyebrowFa,
      titleFa: campaign.titleFa,
      subtitleFa: campaign.subtitleFa,
      ctaLabel: campaign.ctaLabelFa,
      cta: campaign.cta,
      href: resolveCtaHref(campaign.cta, context),
      desktopImageUrl: desktop?.asset.url ?? mobile?.asset.url ?? null,
      mobileImageUrl: mobile?.asset.url ?? desktop?.asset.url ?? null,
      focalX: primary?.item.focalX ?? 50,
      focalY: primary?.item.focalY ?? 50,
      altFa: primary?.item.altFa ?? null,
      images,
    };
  }

  private resolveCategoryDiscovery(
    section: Extract<HomepageSnapshotSection, { type: 'CATEGORY_DISCOVERY' }>,
    context: ResolveContext,
    now: Date,
  ): PublishedHomepageSection | null {
    if (
      !this.isCampaignEligible(
        section.settings.campaign.sourceCampaignId,
        context,
        now,
      )
    ) {
      return null;
    }
    const categories = section.settings.campaign.categoryIds
      .map((id) => context.categories.get(id))
      .filter(
        (tile): tile is PublishedCategoryTile =>
          tile !== undefined && tile.publishedProductCount > 0,
      );
    if (categories.length === 0) return null;
    return {
      key: section.key,
      type: 'CATEGORY_DISCOVERY',
      order: section.order,
      categories,
    };
  }

  private resolveOfferStrip(
    section: Extract<HomepageSnapshotSection, { type: 'OFFER_STRIP' }>,
    context: ResolveContext,
    now: Date,
  ): PublishedHomepageSection | null {
    if (
      !this.isCampaignEligible(
        section.settings.campaign.sourceCampaignId,
        context,
        now,
      )
    ) {
      return null;
    }
    const nowMs = now.getTime();
    const cards = section.settings.campaign.productIds
      .map((id) => context.products.get(id))
      .filter((card): card is CatalogProductCardDto => card !== undefined);
    const eligible = cards.filter((card) => isOfferEligible(card, nowMs));
    let products: CatalogProductCardDto[];
    let mode: 'offer' | 'featured';
    if (eligible.length > 0) {
      products = eligible;
      mode = 'offer';
    } else if (section.settings.fallback === 'featured') {
      products = cards.filter((card) => card.inStock);
      mode = 'featured';
    } else {
      return null;
    }
    if (products.length === 0) return null;
    return {
      key: section.key,
      type: 'OFFER_STRIP',
      order: section.order,
      products,
      mode,
      endsAt: mode === 'offer' ? earliestFuturePromotion(products, nowMs) : null,
      copy: campaignCopy(section.settings.campaign, context),
    };
  }

  private resolveCategorySpotlight(
    section: Extract<HomepageSnapshotSection, { type: 'CATEGORY_SPOTLIGHT' }>,
    context: ResolveContext,
    now: Date,
  ): PublishedHomepageSection | null {
    if (
      !this.isCampaignEligible(
        section.settings.campaign.sourceCampaignId,
        context,
        now,
      )
    ) {
      return null;
    }
    const category = context.categories.get(section.settings.categoryId);
    if (!category || category.publishedProductCount === 0) return null;
    const secondary = section.settings.secondaryCategoryId
      ? context.categories.get(section.settings.secondaryCategoryId)
      : undefined;
    return {
      key: section.key,
      type: 'CATEGORY_SPOTLIGHT',
      order: section.order,
      category,
      secondaryCount: secondary ? secondary.publishedProductCount : null,
      copy: campaignCopy(section.settings.campaign, context),
    };
  }

  private async resolveReadyToShip(
    section: Extract<HomepageSnapshotSection, { type: 'READY_TO_SHIP' }>,
  ): Promise<PublishedHomepageSection | null> {
    const result = await this.publicCatalog.listProducts(
      catalogQuery({
        limit: section.settings.limit,
        sort: 'newest',
        inStockOnly: true,
      }),
    );
    if (result.items.length === 0) return null;
    return {
      key: section.key,
      type: 'READY_TO_SHIP',
      order: section.order,
      products: result.items,
      title: section.settings.title ?? null,
      subtitle: section.settings.subtitle ?? null,
    };
  }

  private async resolveProductRail(
    section: Extract<HomepageSnapshotSection, { type: 'PRODUCT_RAIL' }>,
    context: ResolveContext,
    now: Date,
  ): Promise<PublishedHomepageSection | null> {
    const source = section.settings.source;
    let products: CatalogProductCardDto[];
    if (source.kind === 'campaign') {
      if (
        !this.isCampaignEligible(
          source.campaign.sourceCampaignId,
          context,
          now,
        )
      ) {
        return null;
      }
      products = source.campaign.productIds
        .map((id) => context.products.get(id))
        .filter((card): card is CatalogProductCardDto => card !== undefined);
    } else {
      const categorySlug =
        source.categoryId === null
          ? null
          : context.categories.get(source.categoryId)?.slug;
      const brandSlug =
        source.brandId === null ? null : context.brands.get(source.brandId)?.slug;
      if (source.categoryId !== null && categorySlug === undefined) return null;
      if (source.brandId !== null && brandSlug === undefined) return null;
      const result = await this.publicCatalog.listProducts(
        catalogQuery({
          limit: source.limit,
          sort: source.sort ?? 'newest',
          inStockOnly: source.inStockOnly,
          ...(categorySlug ? { category: categorySlug } : {}),
          ...(brandSlug ? { brand: brandSlug } : {}),
        }),
      );
      products = result.items;
    }
    if (products.length === 0) return null;
    return {
      key: section.key,
      type: 'PRODUCT_RAIL',
      order: section.order,
      title: section.settings.title,
      subtitle: section.settings.subtitle ?? null,
      actionHref: section.settings.actionHref ?? null,
      products,
    };
  }

  private resolveBrandShowcase(
    section: Extract<HomepageSnapshotSection, { type: 'BRAND_SHOWCASE' }>,
    context: ResolveContext,
    now: Date,
  ): PublishedHomepageSection | null {
    if (
      !this.isCampaignEligible(
        section.settings.campaign.sourceCampaignId,
        context,
        now,
      )
    ) {
      return null;
    }
    const cards = section.settings.campaign.productIds
      .map((id) => context.products.get(id))
      .filter((card): card is CatalogProductCardDto => card !== undefined);
    const groups = section.settings.campaign.brandIds.flatMap((brandId) => {
      const brand = context.brands.get(brandId);
      if (!brand) return [];
      const products = cards
        .filter((card) => card.brand?.slug === brand.slug)
        .slice(0, section.settings.productsPerBrand);
      return products.length > 0 ? [{ brand, products }] : [];
    });
    if (groups.length === 0) return null;
    return {
      key: section.key,
      type: 'BRAND_SHOWCASE',
      order: section.order,
      groups,
    };
  }

  private resolveBlogFeature(
    section: Extract<HomepageSnapshotSection, { type: 'BLOG_FEATURE' }>,
    context: ResolveContext,
  ): PublishedHomepageSection | null {
    const posts =
      section.settings.source === 'manual'
        ? section.settings.postIds.flatMap((id) => {
            const post = context.blogById.get(id);
            return post ? [post] : [];
          })
        : context.latestBlog.slice(0, section.settings.limit);
    if (posts.length === 0) return null;
    return {
      key: section.key,
      type: 'BLOG_FEATURE',
      order: section.order,
      posts,
    };
  }

  /**
   * Campaign lifecycle state is resolved live. Snapshot copy remains immutable,
   * but campaign-backed sections stop being exposed once the source campaign is
   * disabled, archived, not yet started, or expired.
   */
  private isCampaignEligible(
    campaignId: string,
    context: ResolveContext,
    now: Date,
  ): boolean {
    const campaign = context.campaigns.get(campaignId);
    if (!campaign) return false;
    return (
      validateCampaignLifecycleEligibility(
        campaign,
        'campaign',
        now,
        'require-active-window',
      ).errors.length === 0
    );
  }
}

function collectReferences(sections: HomepageSnapshotSection[]): ReferenceSets {
  const refs: ReferenceSets = {
    productIds: new Set(),
    categoryIds: new Set(),
    brandIds: new Set(),
    mediaIds: new Set(),
    campaignIds: new Set(),
    manualBlogIds: new Set(),
    latestBlogLimit: 0,
  };
  const addCampaign = (campaign: MerchCampaignSnapshot): void => {
    refs.campaignIds.add(campaign.sourceCampaignId);
    for (const id of campaign.productIds) refs.productIds.add(id);
    for (const id of campaign.categoryIds) refs.categoryIds.add(id);
    for (const id of campaign.brandIds) refs.brandIds.add(id);
    for (const media of campaign.media) refs.mediaIds.add(media.mediaId);
    addCtaTarget(campaign.cta, refs);
  };
  for (const section of sections) {
    if (!section.isVisible) continue;
    switch (section.type) {
      case 'HERO_CAROUSEL':
        section.settings.campaigns.forEach(addCampaign);
        break;
      case 'CATEGORY_DISCOVERY':
        addCampaign(section.settings.campaign);
        break;
      case 'OFFER_STRIP':
        addCampaign(section.settings.campaign);
        break;
      case 'CATEGORY_SPOTLIGHT':
        addCampaign(section.settings.campaign);
        refs.categoryIds.add(section.settings.categoryId);
        if (section.settings.secondaryCategoryId) {
          refs.categoryIds.add(section.settings.secondaryCategoryId);
        }
        break;
      case 'PRODUCT_RAIL':
        if (section.settings.source.kind === 'campaign') {
          addCampaign(section.settings.source.campaign);
        } else {
          if (section.settings.source.categoryId) {
            refs.categoryIds.add(section.settings.source.categoryId);
          }
          if (section.settings.source.brandId) {
            refs.brandIds.add(section.settings.source.brandId);
          }
        }
        break;
      case 'BRAND_SHOWCASE':
        addCampaign(section.settings.campaign);
        break;
      case 'BLOG_FEATURE':
        if (section.settings.source === 'manual') {
          for (const id of section.settings.postIds) refs.manualBlogIds.add(id);
        } else {
          refs.latestBlogLimit = Math.max(
            refs.latestBlogLimit,
            section.settings.limit,
          );
        }
        break;
      case 'TRUST_STRIP':
      case 'READY_TO_SHIP':
        break;
      default: {
        const exhaustive: never = section;
        return exhaustive;
      }
    }
  }
  return refs;
}

function addCtaTarget(cta: MerchCtaTarget, refs: ReferenceSets): void {
  if (cta.kind === 'PRODUCT') refs.productIds.add(cta.productId);
  if (cta.kind === 'CATEGORY') refs.categoryIds.add(cta.categoryId);
  if (cta.kind === 'BRAND') refs.brandIds.add(cta.brandId);
}

function campaignCopy(
  campaign: MerchCampaignSnapshot,
  context: ResolveContext,
): PublishedCampaignCopy {
  return {
    campaignType: campaign.type,
    eyebrowFa: campaign.eyebrowFa,
    titleFa: campaign.titleFa,
    subtitleFa: campaign.subtitleFa,
    ctaLabelFa: campaign.ctaLabelFa,
    cta: campaign.cta,
    href: resolveCtaHref(campaign.cta, context),
  };
}

function resolveCtaHref(
  cta: MerchCtaTarget,
  context: ResolveContext,
): string | null {
  switch (cta.kind) {
    case 'NONE':
      return null;
    case 'ALL_PRODUCTS':
      return '/products';
    case 'NEW_ARRIVALS':
      return '/products?sort=newest';
    case 'PRODUCT': {
      const product = context.products.get(cta.productId);
      return product ? `/products/${encodeURIComponent(product.slug)}` : null;
    }
    case 'CATEGORY': {
      const category = context.categories.get(cta.categoryId);
      return category
        ? `/categories/${encodeURIComponent(category.slug)}`
        : null;
    }
    case 'BRAND': {
      const brand = context.brands.get(cta.brandId);
      return brand
        ? `/products?brand=${encodeURIComponent(brand.slug)}`
        : null;
    }
    default: {
      const exhaustive: never = cta;
      return exhaustive;
    }
  }
}

function isOfferEligible(
  product: CatalogProductCardDto,
  now: number,
): boolean {
  if (!product.inStock || product.callForPrice || product.priceFrom === '') {
    return false;
  }
  const price = Number(product.priceFrom);
  const compareAt =
    product.compareAtPrice === null ? Number.NaN : Number(product.compareAtPrice);
  const hasDiscount =
    Number.isFinite(price) && Number.isFinite(compareAt) && compareAt > price;
  const hasLivePromotion =
    product.promotionEndsAt !== null &&
    Date.parse(product.promotionEndsAt) > now;
  return hasDiscount || hasLivePromotion;
}

function earliestFuturePromotion(
  products: CatalogProductCardDto[],
  now: number,
): string | null {
  return (
    products
      .map((product) => product.promotionEndsAt)
      .filter((value): value is string => value !== null)
      .map((value) => ({ value, timestamp: Date.parse(value) }))
      .filter(
        (entry) =>
          Number.isFinite(entry.timestamp) && entry.timestamp > now,
      )
      .sort((a, b) => a.timestamp - b.timestamp)[0]?.value ?? null
  );
}

function catalogQuery(
  overrides: Partial<ListCatalogProductsQueryDto>,
): ListCatalogProductsQueryDto {
  const query = new ListCatalogProductsQueryDto();
  query.page = 1;
  Object.assign(query, overrides);
  return query;
}
