import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MERCH_BRAND_SHOWCASE_MAX_BRANDS,
  MERCH_CAMPAIGN_MAX_BRANDS,
  MERCH_CAMPAIGN_MAX_CATEGORIES,
  MERCH_CAMPAIGN_MAX_MEDIA,
  MERCH_CAMPAIGN_MAX_PRODUCTS,
  MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES,
  MERCH_HOMEPAGE_SCHEMA_VERSION,
  type HomepageDraftSection,
  type HomepageSnapshot,
  type HomepageSnapshotSection,
  type HomepageValidationIssue,
  type HomepageSectionType,
  type MerchCampaignMediaSnapshot,
  type MerchCampaignSnapshot,
  type MerchCampaignType,
  type MerchCtaTarget,
  type MerchMediaSlot,
  type ProductRailSnapshotSource,
} from '@sabz/types';
import { validateCampaignCta, validateCampaignWindow } from '../campaign-validation';
import { validateHomepageDraftSections } from '../homepage-section-validation';
import {
  validateCampaignLifecycleEligibility,
  type CampaignWindowPolicy,
} from './campaign-eligibility';
import { validateHomepageSnapshot } from '../homepage-snapshot-validation';
import type { MerchValidationIssue } from '../validation';

const campaignSourceInclude = {
  products: {
    orderBy: { sortOrder: 'asc' as const },
    select: { productId: true },
  },
  categories: {
    orderBy: { sortOrder: 'asc' as const },
    select: { categoryId: true },
  },
  brands: {
    orderBy: { sortOrder: 'asc' as const },
    select: { brandId: true },
  },
  media: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      mediaId: true,
      slot: true,
      altFa: true,
      focalX: true,
      focalY: true,
      sortOrder: true,
      media: { select: { id: true, deletedAt: true } },
    },
  },
} satisfies Prisma.MerchCampaignInclude;

type CampaignSourceRow = Prisma.MerchCampaignGetPayload<{
  include: typeof campaignSourceInclude;
}>;

interface CampaignMediaEvidence {
  mediaId: string;
  slot: MerchMediaSlot;
  altFa: string | null;
  focalX: number;
  focalY: number;
  sortOrder: number;
  deletedAt: Date | null;
}

interface CampaignEvidence {
  sourceCampaignId: string;
  type: MerchCampaignType;
  titleFa: string;
  eyebrowFa: string | null;
  subtitleFa: string | null;
  descriptionFa: string | null;
  ctaLabelFa: string | null;
  cta: MerchCtaTarget;
  productIds: string[];
  categoryIds: string[];
  brandIds: string[];
  media: CampaignMediaEvidence[];
  startsAt: Date | null;
  endsAt: Date | null;
}

interface CampaignRef {
  campaignId: string;
  path: string;
  section: HomepageDraftSection;
}

interface CampaignEntry {
  evidence: CampaignEvidence;
  path: string;
  sectionType: HomepageSectionType;
}

export interface HomepageSourceValidation {
  errors: HomepageValidationIssue[];
  warnings: HomepageValidationIssue[];
}

export interface HomepageBuildResult extends HomepageSourceValidation {
  snapshot: HomepageSnapshot | null;
}

export interface HomepageValidationOptions {
  now?: Date;
  windowPolicy?: CampaignWindowPolicy;
}

/**
 * Focused read/validation helper for homepage sections and publication
 * snapshots. It owns campaign/media/catalog/blog reference checks and the
 * immutable snapshot projection; catalog pricing/stock stay outside snapshots.
 */
@Injectable()
export class HomepageSourceService {
  async validateDraft(
    client: Prisma.TransactionClient,
    sections: HomepageDraftSection[],
    options: HomepageValidationOptions = {},
  ): Promise<HomepageSourceValidation> {
    const structural = validateHomepageDraftSections(sections);
    if (!structural.valid) {
      return {
        errors: structural.errors.map(toStructuralIssue),
        warnings: [],
      };
    }
    const refs = collectDraftCampaignRefs(sections);
    const campaigns = await this.loadCampaigns(
      client,
      refs.map((ref) => ref.campaignId),
    );
    return this.analyze(
      client,
      sections,
      refs,
      campaigns,
      options.now ?? new Date(),
      options.windowPolicy ?? 'allow-future-start',
    );
  }

  async buildSnapshot(
    client: Prisma.TransactionClient,
    sections: HomepageDraftSection[],
    options: HomepageValidationOptions = {},
  ): Promise<HomepageBuildResult> {
    const validation = await this.validateDraft(client, sections, options);
    if (validation.errors.length > 0) {
      return { ...validation, snapshot: null };
    }
    const refs = collectDraftCampaignRefs(sections);
    const campaigns = await this.loadCampaigns(
      client,
      refs.map((ref) => ref.campaignId),
    );
    const evidence = campaignEvidenceMap(campaigns);
    const snapshot: HomepageSnapshot = {
      schemaVersion: MERCH_HOMEPAGE_SCHEMA_VERSION,
      sections: sections.map((section) => buildSnapshotSection(section, evidence)),
    };
    const snapshotValidation = validateHomepageSnapshot(snapshot);
    if (!snapshotValidation.valid) {
      return {
        errors: snapshotValidation.errors.map(toStructuralIssue),
        warnings: validation.warnings,
        snapshot: null,
      };
    }
    return { ...validation, snapshot };
  }

  async validateSnapshot(
    client: Prisma.TransactionClient,
    snapshot: HomepageSnapshot,
    now: Date = new Date(),
  ): Promise<HomepageSourceValidation> {
    const structural = validateHomepageSnapshot(snapshot);
    if (!structural.valid) {
      return {
        errors: structural.errors.map(toStructuralIssue),
        warnings: [],
      };
    }
    const entries = collectSnapshotCampaignEntries(snapshot.sections);
    const sourceCampaigns = await client.merchCampaign.findMany({
      where: { id: { in: [...new Set(entries.map((entry) => entry.evidence.sourceCampaignId))] } },
      select: {
        id: true,
        isEnabled: true,
        archivedAt: true,
        startsAt: true,
        endsAt: true,
      },
    });
    const sourceMap = new Map(sourceCampaigns.map((row) => [row.id, row]));
    return this.analyzeSnapshot(
      client,
      snapshot.sections,
      entries,
      sourceMap,
      now,
      'require-active-window',
    );
  }

  private async loadCampaigns(
    client: Prisma.TransactionClient,
    campaignIds: string[],
  ): Promise<Map<string, CampaignSourceRow>> {
    const ids = [...new Set(campaignIds)];
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await client.merchCampaign.findMany({
      where: { id: { in: ids } },
      include: campaignSourceInclude,
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async analyze(
    client: Prisma.TransactionClient,
    sections: HomepageDraftSection[],
    refs: CampaignRef[],
    campaigns: Map<string, CampaignSourceRow>,
    now: Date,
    windowPolicy: CampaignWindowPolicy,
  ): Promise<HomepageSourceValidation> {
    const errors: HomepageValidationIssue[] = [];
    const warnings: HomepageValidationIssue[] = [];
    const refsByCampaign = new Map<string, CampaignRef[]>();
    for (const ref of refs) {
      const list = refsByCampaign.get(ref.campaignId) ?? [];
      list.push(ref);
      refsByCampaign.set(ref.campaignId, list);
    }

    const entries: CampaignEntry[] = [];
    for (const [campaignId, campaignRefs] of refsByCampaign) {
      const row = campaigns.get(campaignId);
      if (!row) {
        for (const ref of campaignRefs) {
          errors.push(
            issue(
              ref.path,
              'MISSING_CAMPAIGN',
              'کمپین انتخاب‌شده وجود ندارد.',
              'MISSING_REFERENCE',
            ),
          );
        }
        continue;
      }
      const evidence = evidenceFromRow(row);
      for (const ref of campaignRefs) {
        entries.push({
          evidence,
          path: ref.path,
          sectionType: ref.section.type,
        });
        const lifecycle = validateCampaignLifecycleEligibility(
          {
            isEnabled: row.isEnabled,
            archivedAt: row.archivedAt,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
          },
          ref.path,
          now,
          windowPolicy,
        );
        errors.push(...lifecycle.errors);
        warnings.push(...lifecycle.warnings);
      }
    }

    await this.analyzeEvidenceCollections(
      client,
      sections.map((section, index) => ({
        type: section.type,
        settings: section.settings as Record<string, unknown>,
        path: sectionPath(index),
      })),
      entries,
      errors,
      warnings,
    );
    return { errors, warnings };
  }

  private async analyzeSnapshot(
    client: Prisma.TransactionClient,
    sections: HomepageSnapshotSection[],
    entries: CampaignEntry[],
    sourceCampaigns: Map<
      string,
      {
        id: string;
        isEnabled: boolean;
        archivedAt: Date | null;
        startsAt: Date | null;
        endsAt: Date | null;
      }
    >,
    now: Date,
    windowPolicy: CampaignWindowPolicy,
  ): Promise<HomepageSourceValidation> {
    const errors: HomepageValidationIssue[] = [];
    const warnings: HomepageValidationIssue[] = [];
    for (const entry of entries) {
      const source = sourceCampaigns.get(entry.evidence.sourceCampaignId);
      if (!source) {
        errors.push(
          issue(
            entry.path,
            'MISSING_CAMPAIGN',
            'کمپین منبع این نسخه وجود ندارد.',
            'MISSING_REFERENCE',
          ),
        );
        continue;
      }
      const lifecycle = validateCampaignLifecycleEligibility(
        {
          isEnabled: source.isEnabled,
          archivedAt: source.archivedAt,
          startsAt: source.startsAt,
          endsAt: source.endsAt,
        },
        entry.path,
        now,
        windowPolicy,
      );
      errors.push(...lifecycle.errors);
      warnings.push(...lifecycle.warnings);
    }
    await this.analyzeEvidenceCollections(
      client,
      sections.map((section, index) => ({
        type: section.type,
        settings: section.settings as Record<string, unknown>,
        path: `sections[${index}]`,
      })),
      entries,
      errors,
      warnings,
    );
    return { errors, warnings };
  }

  private async analyzeEvidenceCollections(
    client: Prisma.TransactionClient,
    sections: Array<{
      type: HomepageSectionType;
      settings: Record<string, unknown>;
      path: string;
    }>,
    entries: CampaignEntry[],
    errors: HomepageValidationIssue[],
    warnings: HomepageValidationIssue[],
  ): Promise<void> {
    const productIds = new Set<string>();
    const categoryIds = new Set<string>();
    const brandIds = new Set<string>();
    const mediaIds = new Set<string>();
    const blogPostIds = new Set<string>();

    for (const entry of entries) {
      for (const id of entry.evidence.productIds) productIds.add(id);
      for (const id of entry.evidence.categoryIds) categoryIds.add(id);
      for (const id of entry.evidence.brandIds) brandIds.add(id);
      for (const media of entry.evidence.media) mediaIds.add(media.mediaId);
    }
    for (const section of sections) {
      if (section.type === 'CATEGORY_SPOTLIGHT') {
        collectString(categoryIds, section.settings.categoryId);
        collectString(categoryIds, section.settings.secondaryCategoryId);
      }
      if (section.type === 'PRODUCT_RAIL') {
        const source = section.settings.source;
        if (isRecord(source) && source.kind === 'query') {
          collectString(categoryIds, source.categoryId);
          collectString(brandIds, source.brandId);
        }
      }
      if (section.type === 'BLOG_FEATURE' && section.settings.source === 'manual') {
        const postIds = section.settings.postIds;
        if (Array.isArray(postIds)) {
          for (const id of postIds) collectString(blogPostIds, id);
        }
      }
    }

    const [products, categories, brands, media, blogPosts] = await Promise.all([
      productIds.size > 0
        ? client.product.findMany({
            where: { id: { in: [...productIds] } },
            select: { id: true, status: true, deletedAt: true },
          })
        : Promise.resolve([]),
      categoryIds.size > 0
        ? client.category.findMany({
            where: { id: { in: [...categoryIds] } },
            select: { id: true, isVisible: true, deletedAt: true },
          })
        : Promise.resolve([]),
      brandIds.size > 0
        ? client.brand.findMany({
            where: { id: { in: [...brandIds] } },
            select: { id: true, deletedAt: true },
          })
        : Promise.resolve([]),
      mediaIds.size > 0
        ? client.merchMedia.findMany({
            where: { id: { in: [...mediaIds] } },
            select: { id: true, deletedAt: true },
          })
        : Promise.resolve([]),
      blogPostIds.size > 0
        ? client.blogPost.findMany({
            where: { id: { in: [...blogPostIds] } },
            select: { id: true, status: true },
          })
        : Promise.resolve([]),
    ]);

    const productMap = new Map(products.map((row) => [row.id, row]));
    const categoryMap = new Map(categories.map((row) => [row.id, row]));
    const brandMap = new Map(brands.map((row) => [row.id, row]));
    const mediaMap = new Map(media.map((row) => [row.id, row]));
    const blogMap = new Map(blogPosts.map((row) => [row.id, row]));

    for (const entry of entries) {
      validateCampaignEvidence(
        entry,
        productMap,
        categoryMap,
        brandMap,
        mediaMap,
        errors,
        warnings,
      );
    }

    for (const section of sections) {
      if (section.type === 'CATEGORY_DISCOVERY') {
        const campaign = entries.find(
          (entry) =>
            entry.path === `${section.path}.settings.campaignId` ||
            entry.path === `${section.path}.settings.campaign`,
        );
        if (
          campaign &&
          (campaign.evidence.categoryIds.length < 1 ||
            campaign.evidence.categoryIds.length > MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES)
        ) {
          errors.push(
            issue(
              `${section.path}.settings.campaignId`,
              'CATEGORY_DISCOVERY_SELECTION_INVALID',
              `کمپین کشف دسته‌بندی باید بین ۱ تا ${MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES} دسته‌بندی داشته باشد.`,
              'INELIGIBLE_REFERENCE',
            ),
          );
        }
      }
      if (section.type === 'BRAND_SHOWCASE') {
        const campaign = entries.find(
          (entry) =>
            entry.path === `${section.path}.settings.campaignId` ||
            entry.path === `${section.path}.settings.campaign`,
        );
        if (
          campaign &&
          (campaign.evidence.brandIds.length < 1 ||
            campaign.evidence.brandIds.length > MERCH_BRAND_SHOWCASE_MAX_BRANDS)
        ) {
          errors.push(
            issue(
              `${section.path}.settings.campaignId`,
              'BRAND_SHOWCASE_SELECTION_INVALID',
              `کمپین ویترین برند باید بین ۱ تا ${MERCH_BRAND_SHOWCASE_MAX_BRANDS} برند داشته باشد.`,
              'INELIGIBLE_REFERENCE',
            ),
          );
        }
      }
      if (section.type === 'CATEGORY_SPOTLIGHT') {
        const primary = asString(section.settings.categoryId);
        const secondary = asString(section.settings.secondaryCategoryId);
        validateCategoryReference(
          primary,
          `${section.path}.settings.categoryId`,
          categoryMap,
          errors,
        );
        if (secondary) {
          validateCategoryReference(
            secondary,
            `${section.path}.settings.secondaryCategoryId`,
            categoryMap,
            errors,
          );
        }
        const campaign = entries.find(
          (entry) => entry.path.startsWith(`${section.path}.settings.campaign`),
        );
        if (campaign && primary && !campaign.evidence.categoryIds.includes(primary)) {
          errors.push(
            issue(
              `${section.path}.settings.categoryId`,
              'CATEGORY_NOT_IN_CAMPAIGN',
              'دسته‌بندی اصلی باید در انتخاب‌های کمپین باشد.',
              'INELIGIBLE_REFERENCE',
            ),
          );
        }
      }
      if (section.type === 'PRODUCT_RAIL') {
        const source = section.settings.source;
        if (isRecord(source) && source.kind === 'query') {
          if (typeof source.categoryId === 'string') {
            validateCategoryReference(
              source.categoryId,
              `${section.path}.settings.source.categoryId`,
              categoryMap,
              errors,
            );
          }
          if (typeof source.brandId === 'string') {
            const brand = brandMap.get(source.brandId);
            if (!brand) {
              errors.push(
                issue(
                  `${section.path}.settings.source.brandId`,
                  'MISSING_BRAND',
                  'برند منبع ریل وجود ندارد.',
                  'MISSING_REFERENCE',
                ),
              );
            } else if (brand.deletedAt !== null) {
              errors.push(
                issue(
                  `${section.path}.settings.source.brandId`,
                  'BRAND_INELIGIBLE',
                  'برند منبع ریل در دسترس نیست.',
                  'INELIGIBLE_REFERENCE',
                ),
              );
            }
          }
        }
      }
      if (section.type === 'BLOG_FEATURE' && section.settings.source === 'manual') {
        const postIds = Array.isArray(section.settings.postIds)
          ? section.settings.postIds
          : [];
        postIds.forEach((postId, index) => {
          if (typeof postId !== 'string') return;
          const post = blogMap.get(postId);
          if (!post) {
            errors.push(
              issue(
                `${section.path}.settings.postIds[${index}]`,
                'MISSING_BLOG_POST',
                'مقاله انتخاب‌شده وجود ندارد.',
                'MISSING_REFERENCE',
              ),
            );
          } else if (post.status !== 'PUBLISHED') {
            errors.push(
              issue(
                `${section.path}.settings.postIds[${index}]`,
                'BLOG_POST_NOT_PUBLISHED',
                'مقاله انتخاب‌شده منتشر نشده است.',
                'INELIGIBLE_REFERENCE',
              ),
            );
          }
        });
      }
    }
  }
}

function validateCampaignEvidence(
  entry: CampaignEntry,
  products: Map<string, { id: string; status: string; deletedAt: Date | null }>,
  categories: Map<string, { id: string; isVisible: boolean; deletedAt: Date | null }>,
  brands: Map<string, { id: string; deletedAt: Date | null }>,
  media: Map<string, { id: string; deletedAt: Date | null }>,
  errors: HomepageValidationIssue[],
  warnings: HomepageValidationIssue[],
): void {
  const evidence = entry.evidence;
  const path = entry.path;

  if (evidence.productIds.length > MERCH_CAMPAIGN_MAX_PRODUCTS) {
    errors.push(
      issue(
        `${path}.products`,
        'CAMPAIGN_SELECTION_LIMIT',
        `حداکثر ${MERCH_CAMPAIGN_MAX_PRODUCTS} محصول در هر کمپین مجاز است.`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }
  if (evidence.categoryIds.length > MERCH_CAMPAIGN_MAX_CATEGORIES) {
    errors.push(
      issue(
        `${path}.categories`,
        'CAMPAIGN_SELECTION_LIMIT',
        `حداکثر ${MERCH_CAMPAIGN_MAX_CATEGORIES} دسته‌بندی در هر کمپین مجاز است.`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }
  if (evidence.brandIds.length > MERCH_CAMPAIGN_MAX_BRANDS) {
    errors.push(
      issue(
        `${path}.brands`,
        'CAMPAIGN_SELECTION_LIMIT',
        `حداکثر ${MERCH_CAMPAIGN_MAX_BRANDS} برند در هر کمپین مجاز است.`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }
  if (evidence.media.length > MERCH_CAMPAIGN_MAX_MEDIA) {
    errors.push(
      issue(
        `${path}.media`,
        'CAMPAIGN_SELECTION_LIMIT',
        `حداکثر ${MERCH_CAMPAIGN_MAX_MEDIA} رسانه در هر کمپین مجاز است.`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }

  const missingProducts = evidence.productIds.filter((id) => !products.has(id));
  const ineligibleProducts = evidence.productIds.filter((id) => {
    const row = products.get(id);
    return row !== undefined && (row.deletedAt !== null || row.status !== 'PUBLISHED');
  });
  if (missingProducts.length > 0) {
    errors.push(
      issue(
        `${path}.products`,
        'MISSING_PRODUCT',
        `محصول(های) انتخاب‌شده وجود ندارند: ${missingProducts.join(', ')}`,
        'MISSING_REFERENCE',
      ),
    );
  }
  if (ineligibleProducts.length > 0) {
    errors.push(
      issue(
        `${path}.products`,
        'PRODUCT_INELIGIBLE',
        `محصول(های) انتخاب‌شده منتشرشده یا در دسترس نیستند: ${ineligibleProducts.join(', ')}`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }

  const missingCategories = evidence.categoryIds.filter((id) => !categories.has(id));
  const ineligibleCategories = evidence.categoryIds.filter((id) => {
    const row = categories.get(id);
    return row !== undefined && (row.deletedAt !== null || !row.isVisible);
  });
  if (missingCategories.length > 0) {
    errors.push(
      issue(
        `${path}.categories`,
        'MISSING_CATEGORY',
        `دسته‌بندی(های) انتخاب‌شده وجود ندارند: ${missingCategories.join(', ')}`,
        'MISSING_REFERENCE',
      ),
    );
  }
  if (ineligibleCategories.length > 0) {
    errors.push(
      issue(
        `${path}.categories`,
        'CATEGORY_INELIGIBLE',
        `دسته‌بندی(های) انتخاب‌شده در دسترس یا قابل نمایش نیستند: ${ineligibleCategories.join(', ')}`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }

  const missingBrands = evidence.brandIds.filter((id) => !brands.has(id));
  const ineligibleBrands = evidence.brandIds.filter((id) => {
    const row = brands.get(id);
    return row !== undefined && row.deletedAt !== null;
  });
  if (missingBrands.length > 0) {
    errors.push(
      issue(
        `${path}.brands`,
        'MISSING_BRAND',
        `برند(های) انتخاب‌شده وجود ندارند: ${missingBrands.join(', ')}`,
        'MISSING_REFERENCE',
      ),
    );
  }
  if (ineligibleBrands.length > 0) {
    errors.push(
      issue(
        `${path}.brands`,
        'BRAND_INELIGIBLE',
        `برند(های) انتخاب‌شده در دسترس نیستند: ${ineligibleBrands.join(', ')}`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }

  const missingMedia = evidence.media.filter((item) => !media.has(item.mediaId));
  const ineligibleMedia = evidence.media.filter((item) => {
    const row = media.get(item.mediaId);
    return row !== undefined && row.deletedAt !== null;
  });
  if (missingMedia.length > 0) {
    errors.push(
      issue(
        `${path}.media`,
        'MISSING_MEDIA',
        `رسانه(های) انتخاب‌شده وجود ندارند: ${missingMedia.map((item) => item.mediaId).join(', ')}`,
        'MISSING_REFERENCE',
      ),
    );
  }
  if (ineligibleMedia.length > 0) {
    errors.push(
      issue(
        `${path}.media`,
        'MEDIA_INELIGIBLE',
        `رسانه(های) انتخاب‌شده حذف شده‌اند: ${ineligibleMedia.map((item) => item.mediaId).join(', ')}`,
        'INELIGIBLE_REFERENCE',
      ),
    );
  }

  if (evidence.cta.kind !== 'NONE' && !evidence.ctaLabelFa) {
    errors.push(
      issue(
        `${path}.ctaLabelFa`,
        'CAMPAIGN_CTA_LABEL_MISSING',
        'برای مقصد فراخوانی، متن دکمه الزامی است.',
        'INELIGIBLE_REFERENCE',
      ),
    );
  }
  const ctaValidation = validateCampaignCta(evidence.cta);
  for (const ctaError of ctaValidation.errors) {
    errors.push({
      ...toStructuralIssue(ctaError),
      path: `${path}.${ctaError.path}`,
    });
  }
  if (evidence.cta.kind === 'PRODUCT') {
    const row = products.get(evidence.cta.productId);
    if (!row) {
      errors.push(
        issue(
          `${path}.cta.productId`,
          'MISSING_CTA_PRODUCT',
          'محصول مقصد فراخوانی وجود ندارد.',
          'MISSING_REFERENCE',
        ),
      );
    } else if (row.deletedAt !== null || row.status !== 'PUBLISHED') {
      errors.push(
        issue(
          `${path}.cta.productId`,
          'CTA_PRODUCT_INELIGIBLE',
          'محصول مقصد فراخوانی در دسترس نیست.',
          'INELIGIBLE_REFERENCE',
        ),
      );
    }
  }
  if (evidence.cta.kind === 'CATEGORY') {
    const row = categories.get(evidence.cta.categoryId);
    if (!row) {
      errors.push(
        issue(
          `${path}.cta.categoryId`,
          'MISSING_CTA_CATEGORY',
          'دسته‌بندی مقصد فراخوانی وجود ندارد.',
          'MISSING_REFERENCE',
        ),
      );
    } else if (row.deletedAt !== null || !row.isVisible) {
      errors.push(
        issue(
          `${path}.cta.categoryId`,
          'CTA_CATEGORY_INELIGIBLE',
          'دسته‌بندی مقصد فراخوانی در دسترس نیست.',
          'INELIGIBLE_REFERENCE',
        ),
      );
    }
  }
  if (evidence.cta.kind === 'BRAND') {
    const row = brands.get(evidence.cta.brandId);
    if (!row) {
      errors.push(
        issue(
          `${path}.cta.brandId`,
          'MISSING_CTA_BRAND',
          'برند مقصد فراخوانی وجود ندارد.',
          'MISSING_REFERENCE',
        ),
      );
    } else if (row.deletedAt !== null) {
      errors.push(
        issue(
          `${path}.cta.brandId`,
          'CTA_BRAND_INELIGIBLE',
          'برند مقصد فراخوانی در دسترس نیست.',
          'INELIGIBLE_REFERENCE',
        ),
      );
    }
  }

  const window = validateCampaignWindow(
    evidence.startsAt?.toISOString() ?? null,
    evidence.endsAt?.toISOString() ?? null,
  );
  for (const windowError of window.errors) {
    errors.push({
      ...toStructuralIssue(windowError),
      path: `${path}.${windowError.path}`,
    });
  }
  if (entry.sectionType === 'HERO_CAROUSEL') {
    const slots = new Set(evidence.media.map((item) => item.slot));
    if (!slots.has('HERO_DESKTOP')) {
      errors.push(
        issue(
          `${path}.media`,
          'HERO_DESKTOP_MEDIA_REQUIRED',
          'برای اسلاید هیرو، رسانه HERO_DESKTOP الزامی است.',
          'INELIGIBLE_REFERENCE',
        ),
      );
    } else if (!slots.has('HERO_MOBILE')) {
      warnings.push(
        issue(
          `${path}.media`,
          'HERO_MOBILE_MEDIA_MISSING',
          'رسانه HERO_MOBILE تعیین نشده است؛ نسخه دسکتاپ به‌عنوان جایگزین استفاده می‌شود.',
          'WARNING',
          'WARNING',
        ),
      );
    }
  }
}

function validateCategoryReference(
  categoryId: string | null,
  path: string,
  categories: Map<string, { id: string; isVisible: boolean; deletedAt: Date | null }>,
  errors: HomepageValidationIssue[],
): void {
  if (!categoryId) return;
  const row = categories.get(categoryId);
  if (!row) {
    errors.push(
      issue(path, 'MISSING_CATEGORY', 'دسته‌بندی انتخاب‌شده وجود ندارد.', 'MISSING_REFERENCE'),
    );
  } else if (row.deletedAt !== null || !row.isVisible) {
    errors.push(
      issue(
        path,
        'CATEGORY_INELIGIBLE',
        'دسته‌بندی انتخاب‌شده در دسترس یا قابل نمایش نیست.',
        'INELIGIBLE_REFERENCE',
      ),
    );
  }
}

function evidenceFromRow(row: CampaignSourceRow): CampaignEvidence {
  return {
    sourceCampaignId: row.id,
    type: row.type,
    titleFa: row.titleFa,
    eyebrowFa: row.eyebrowFa,
    subtitleFa: row.subtitleFa,
    descriptionFa: row.descriptionFa,
    ctaLabelFa: row.ctaLabelFa,
    cta: ctaFromRow(row),
    productIds: row.products.map((item) => item.productId),
    categoryIds: row.categories.map((item) => item.categoryId),
    brandIds: row.brands.map((item) => item.brandId),
    media: row.media.map((item) => ({
      mediaId: item.mediaId,
      slot: item.slot,
      altFa: item.altFa,
      focalX: item.focalX,
      focalY: item.focalY,
      sortOrder: item.sortOrder,
      deletedAt: item.media.deletedAt,
    })),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
  };
}

function evidenceFromSnapshot(snapshot: MerchCampaignSnapshot): CampaignEvidence {
  return {
    sourceCampaignId: snapshot.sourceCampaignId,
    type: snapshot.type,
    titleFa: snapshot.titleFa,
    eyebrowFa: snapshot.eyebrowFa,
    subtitleFa: snapshot.subtitleFa,
    descriptionFa: snapshot.descriptionFa,
    ctaLabelFa: snapshot.ctaLabelFa,
    cta: snapshot.cta,
    productIds: [...snapshot.productIds],
    categoryIds: [...snapshot.categoryIds],
    brandIds: [...snapshot.brandIds],
    media: snapshot.media.map((item) => ({
      ...item,
      deletedAt: null,
    })),
    startsAt: parseDate(snapshot.startsAt),
    endsAt: parseDate(snapshot.endsAt),
  };
}

function ctaFromRow(row: CampaignSourceRow): MerchCtaTarget {
  switch (row.ctaKind) {
    case 'PRODUCT':
      return row.ctaProductId
        ? { kind: 'PRODUCT', productId: row.ctaProductId }
        : { kind: 'NONE' };
    case 'CATEGORY':
      return row.ctaCategoryId
        ? { kind: 'CATEGORY', categoryId: row.ctaCategoryId }
        : { kind: 'NONE' };
    case 'BRAND':
      return row.ctaBrandId
        ? { kind: 'BRAND', brandId: row.ctaBrandId }
        : { kind: 'NONE' };
    case 'ALL_PRODUCTS':
      return { kind: 'ALL_PRODUCTS' };
    case 'NEW_ARRIVALS':
      return { kind: 'NEW_ARRIVALS' };
    default:
      return { kind: 'NONE' };
  }
}

function campaignEvidenceMap(
  campaigns: Map<string, CampaignSourceRow>,
): Map<string, CampaignEvidence> {
  return new Map(
    [...campaigns.entries()].map(([id, row]) => [id, evidenceFromRow(row)]),
  );
}

function buildSnapshotSection(
  section: HomepageDraftSection,
  campaigns: Map<string, CampaignEvidence>,
): HomepageSnapshotSection {
  const base = {
    key: section.key,
    order: section.order,
    isVisible: section.isVisible,
  };
  switch (section.type) {
    case 'HERO_CAROUSEL':
      return {
        ...base,
        type: 'HERO_CAROUSEL',
        settings: {
          campaigns: section.settings.campaignIds.map((id) =>
            campaignSnapshot(requiredCampaign(campaigns, id)),
          ),
        },
      };
    case 'TRUST_STRIP':
      return {
        ...base,
        type: 'TRUST_STRIP',
        settings: { items: section.settings.items.map((item) => ({ ...item })) },
      };
    case 'CATEGORY_DISCOVERY':
      return {
        ...base,
        type: 'CATEGORY_DISCOVERY',
        settings: {
          campaign: campaignSnapshot(
            requiredCampaign(campaigns, section.settings.campaignId),
          ),
        },
      };
    case 'OFFER_STRIP':
      return {
        ...base,
        type: 'OFFER_STRIP',
        settings: {
          campaign: campaignSnapshot(
            requiredCampaign(campaigns, section.settings.campaignId),
          ),
          fallback: section.settings.fallback,
        },
      };
    case 'CATEGORY_SPOTLIGHT':
      return {
        ...base,
        type: 'CATEGORY_SPOTLIGHT',
        settings: {
          campaign: campaignSnapshot(
            requiredCampaign(campaigns, section.settings.campaignId),
          ),
          categoryId: section.settings.categoryId,
          secondaryCategoryId: section.settings.secondaryCategoryId ?? null,
        },
      };
    case 'READY_TO_SHIP':
      return {
        ...base,
        type: 'READY_TO_SHIP',
        settings: {
          limit: section.settings.limit,
          ...(section.settings.title !== undefined
            ? { title: section.settings.title }
            : {}),
          ...(section.settings.subtitle !== undefined
            ? { subtitle: section.settings.subtitle }
            : {}),
        },
      };
    case 'PRODUCT_RAIL': {
      const source: ProductRailSnapshotSource =
        section.settings.source.kind === 'campaign'
          ? {
              kind: 'campaign',
              campaign: campaignSnapshot(
                requiredCampaign(campaigns, section.settings.source.campaignId),
              ),
            }
          : {
              kind: 'query',
              categoryId: section.settings.source.categoryId ?? null,
              brandId: section.settings.source.brandId ?? null,
              sort: section.settings.source.sort ?? null,
              limit: section.settings.source.limit,
              inStockOnly: section.settings.source.inStockOnly ?? false,
            };
      return {
        ...base,
        type: 'PRODUCT_RAIL',
        settings: {
          title: section.settings.title,
          ...(section.settings.subtitle !== undefined
            ? { subtitle: section.settings.subtitle }
            : {}),
          ...(section.settings.actionHref !== undefined
            ? { actionHref: section.settings.actionHref }
            : {}),
          source,
        },
      };
    }
    case 'BRAND_SHOWCASE':
      return {
        ...base,
        type: 'BRAND_SHOWCASE',
        settings: {
          campaign: campaignSnapshot(
            requiredCampaign(campaigns, section.settings.campaignId),
          ),
          productsPerBrand: section.settings.productsPerBrand,
        },
      };
    case 'BLOG_FEATURE':
      return {
        ...base,
        type: 'BLOG_FEATURE',
        settings:
          section.settings.source === 'manual'
            ? { source: 'manual', postIds: [...section.settings.postIds] }
            : { source: 'latest', limit: section.settings.limit },
      };
    default: {
      const exhaustive: never = section;
      return exhaustive;
    }
  }
}

function requiredCampaign(
  campaigns: Map<string, CampaignEvidence>,
  campaignId: string,
): CampaignEvidence {
  const campaign = campaigns.get(campaignId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} was not loaded for snapshot`);
  }
  return campaign;
}

function campaignSnapshot(evidence: CampaignEvidence): MerchCampaignSnapshot {
  return {
    sourceCampaignId: evidence.sourceCampaignId,
    type: evidence.type,
    titleFa: evidence.titleFa,
    eyebrowFa: evidence.eyebrowFa,
    subtitleFa: evidence.subtitleFa,
    descriptionFa: evidence.descriptionFa,
    ctaLabelFa: evidence.ctaLabelFa,
    cta: evidence.cta,
    productIds: [...evidence.productIds],
    categoryIds: [...evidence.categoryIds],
    brandIds: [...evidence.brandIds],
    media: evidence.media.map(
      (item): MerchCampaignMediaSnapshot => ({
        mediaId: item.mediaId,
        slot: item.slot,
        altFa: item.altFa,
        focalX: item.focalX,
        focalY: item.focalY,
        sortOrder: item.sortOrder,
      }),
    ),
    startsAt: evidence.startsAt?.toISOString() ?? null,
    endsAt: evidence.endsAt?.toISOString() ?? null,
  };
}

function collectDraftCampaignRefs(sections: HomepageDraftSection[]): CampaignRef[] {
  const refs: CampaignRef[] = [];
  sections.forEach((section, index) => {
    const path = sectionPath(index);
    switch (section.type) {
      case 'HERO_CAROUSEL':
        section.settings.campaignIds.forEach((campaignId, campaignIndex) => {
          refs.push({
            campaignId,
            path: `${path}.settings.campaignIds[${campaignIndex}]`,
            section,
          });
        });
        break;
      case 'CATEGORY_DISCOVERY':
        refs.push({
          campaignId: section.settings.campaignId,
          path: `${path}.settings.campaignId`,
          section,
        });
        break;
      case 'OFFER_STRIP':
        refs.push({
          campaignId: section.settings.campaignId,
          path: `${path}.settings.campaignId`,
          section,
        });
        break;
      case 'CATEGORY_SPOTLIGHT':
        refs.push({
          campaignId: section.settings.campaignId,
          path: `${path}.settings.campaignId`,
          section,
        });
        break;
      case 'PRODUCT_RAIL':
        if (section.settings.source.kind === 'campaign') {
          refs.push({
            campaignId: section.settings.source.campaignId,
            path: `${path}.settings.source.campaignId`,
            section,
          });
        }
        break;
      case 'BRAND_SHOWCASE':
        refs.push({
          campaignId: section.settings.campaignId,
          path: `${path}.settings.campaignId`,
          section,
        });
        break;
      case 'TRUST_STRIP':
      case 'READY_TO_SHIP':
      case 'BLOG_FEATURE':
        break;
      default: {
        const exhaustive: never = section;
        return exhaustive;
      }
    }
  });
  return refs;
}

function collectSnapshotCampaignEntries(
  sections: HomepageSnapshotSection[],
): CampaignEntry[] {
  const entries: CampaignEntry[] = [];
  sections.forEach((section, index) => {
    const path = sectionPath(index);
    const add = (campaign: MerchCampaignSnapshot, campaignPath: string) => {
      entries.push({
        evidence: evidenceFromSnapshot(campaign),
        path: campaignPath,
        sectionType: section.type,
      });
    };
    switch (section.type) {
      case 'HERO_CAROUSEL':
        section.settings.campaigns.forEach((campaign, campaignIndex) => {
          add(campaign, `${path}.settings.campaigns[${campaignIndex}]`);
        });
        break;
      case 'CATEGORY_DISCOVERY':
        add(section.settings.campaign, `${path}.settings.campaign`);
        break;
      case 'OFFER_STRIP':
        add(section.settings.campaign, `${path}.settings.campaign`);
        break;
      case 'CATEGORY_SPOTLIGHT':
        add(section.settings.campaign, `${path}.settings.campaign`);
        break;
      case 'PRODUCT_RAIL':
        if (section.settings.source.kind === 'campaign') {
          add(section.settings.source.campaign, `${path}.settings.source.campaign`);
        }
        break;
      case 'BRAND_SHOWCASE':
        add(section.settings.campaign, `${path}.settings.campaign`);
        break;
      case 'TRUST_STRIP':
      case 'READY_TO_SHIP':
      case 'BLOG_FEATURE':
        break;
      default: {
        const exhaustive: never = section;
        return exhaustive;
      }
    }
  });
  return entries;
}

function sectionPath(index: number): string {
  return `sections[${index}]`;
}

function toStructuralIssue(error: MerchValidationIssue): HomepageValidationIssue {
  return {
    path: error.path,
    code: error.code,
    message: error.message,
    severity: 'ERROR',
    category: 'STRUCTURAL',
  };
}

function issue(
  path: string,
  code: string,
  message: string,
  category: HomepageValidationIssue['category'],
  severity: HomepageValidationIssue['severity'] = 'ERROR',
): HomepageValidationIssue {
  return { path, code, message, severity, category };
}

function parseDate(value: string | null): Date | null {
  return value === null ? null : new Date(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function collectString(target: Set<string>, value: unknown): void {
  if (typeof value === 'string') target.add(value);
}
