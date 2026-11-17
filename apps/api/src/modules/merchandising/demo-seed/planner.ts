import type {
  CatalogProductCardDto,
  CreateMerchCampaignInput,
  HomepageDraftSection,
} from '@sabz/types';
import {
  DEMO_SEED_ACTOR_ID,
} from './constants';
import {
  applyGuardBlockers,
  validatePublicApiBaseUrl,
} from './identity';
import { validateManifestContent } from './content-validation';
import {
  blogOwnership,
  campaignOwnership,
  expectedMediaOriginalName,
  mediaOwnership,
} from './ownership';
import type {
  DemoBlogRow,
  DemoCampaignDefinition,
  DemoCampaignRow,
  DemoMediaRow,
  DemoSeedCandidates,
  DemoSeedManifest,
  DemoSeedPlan,
  DemoSeedPlanInput,
  DemoSeedSectionPreview,
  DemoSectionDefinition,
} from './types';

export class DemoSeedBlockedError extends Error {
  constructor(readonly blockers: DemoSeedPlan['blockers']) {
    super(
      `Homepage demo seed is blocked:\n${blockers
        .map((blocker) => `- [${blocker.code}] ${blocker.message}`)
        .join('\n')}`,
    );
    this.name = 'DemoSeedBlockedError';
  }
}

export function buildDemoSeedPlan(input: DemoSeedPlanInput): DemoSeedPlan {
  const blockers = applyGuardBlockers(input.options, input.identity);
  const warnings: DemoSeedPlan['warnings'] = [];
  const notes: string[] = [];

  for (const approval of Object.values(input.manifest.approvals)) {
    if (!approval.approved) {
      blockers.push({
        code: 'APPROVAL_PENDING',
        message: `Approval pending: ${approval.label} — ${approval.note}`,
        severity: 'BLOCKER',
      });
    }
  }

  for (const issue of validateManifestContent(input.manifest)) {
    blockers.push({
      code: 'CONTENT_INCOMPLETE',
      message: `Content is incomplete at ${issue.path}: ${issue.message}`,
      severity: 'BLOCKER',
    });
  }

  const draft = input.baseline.draft;
  if (draft !== null && draft.schemaVersion !== 1) {
    blockers.push({
      code: 'DRAFT_SCHEMA_UNSUPPORTED',
      message: `Draft schema version ${draft.schemaVersion} is not supported by this tool.`,
      severity: 'BLOCKER',
    });
  }
  if (draft !== null && !input.options.replaceDraft) {
    blockers.push({
      code: 'DRAFT_REPLACEMENT_FLAG_MISSING',
      message:
        'An existing draft is present. Pass --replace-draft and a verified backup will be required.',
      severity: 'BLOCKER',
    });
  }

  const publishedVersions = input.baseline.publications
    .filter((publication) => publication.status === 'PUBLISHED')
    .map((publication) => publication.version);
  if (input.options.publish && !input.options.acknowledgePublicationReplacement) {
    blockers.push({
      code: 'PUBLICATION_REPLACEMENT_ACK_MISSING',
      message:
        'Publishing requires --acknowledge-publication-replacement in addition to the publish confirmation environment variable.',
      severity: 'BLOCKER',
    });
  }

  if (!input.options.publish && input.manifest.blog.length > 0) {
    blockers.push({
      code: 'BLOG_ACTIVATION_REQUIRES_PUBLICATION',
      message:
        'The current homepage snapshot contract requires published blog posts. Demo articles are created as drafts and activated inside the homepage publication transaction, so this manifest cannot be applied draft-only.',
      severity: 'BLOCKER',
    });
  }
  if (input.options.publish) {
    for (const article of input.manifest.blog) {
      if (!article.publish) {
        blockers.push({
          code: 'BLOG_ARTICLE_PUBLISH_REQUIRED',
          message:
            `Blog article ${article.slug} is marked publish=false, but the current homepage BLOG_FEATURE contract requires the referenced posts to be published. Mark the article publish=true or remove it from the feature section before applying.`,
          severity: 'BLOCKER',
        });
      }
    }
  }

  const publicBaseCheck = validatePublicApiBaseUrl(
    input.options.publicApiBaseUrl,
  );
  if (!publicBaseCheck.valid) {
    blockers.push({
      code: 'PUBLIC_API_BASE_INVALID',
      message: `${publicBaseCheck.reason ?? 'Invalid public API base URL.'} Required for browser-accessible campaign media and blog covers.`,
      severity: 'BLOCKER',
    });
  }

  for (const duplicate of duplicates(
    input.campaigns.map((row) => row.internalName),
  )) {
    blockers.push({
      code: 'OWNERSHIP_AMBIGUOUS',
      message: `Multiple campaigns share the internal name ${duplicate}; ownership is ambiguous.`,
      severity: 'BLOCKER',
    });
  }
  for (const duplicate of duplicates(
    input.media.map((row) => row.originalName),
  )) {
    blockers.push({
      code: 'OWNERSHIP_AMBIGUOUS',
      message: `Multiple media rows share the display name ${duplicate}; ownership is ambiguous.`,
      severity: 'BLOCKER',
    });
  }

  const campaignRows = groupCampaigns(input.campaigns);
  const blogRows = groupBlogPosts(input.blogPosts);
  const mediaRows = groupMedia(input.media);

  const campaignPlans = input.manifest.campaigns.map((definition) =>
    planCampaign(definition, input, campaignRows),
  );
  const blogPlans = input.manifest.blog.map((definition) => {
    const expectedSlug = definition.slug;
    const existing = blogRows.get(expectedSlug) ?? null;
    const ownership = blogOwnership(existing, expectedSlug);
    const planBlockers: DemoSeedPlan['blockers'] = [];
    if (ownership === 'manually-edited') {
      planBlockers.push({
        code: 'OWNERSHIP_MANUALLY_EDITED',
        message: `Blog post ${expectedSlug} was manually edited after demo creation; the tool will not overwrite it.`,
        severity: 'BLOCKER',
      });
    } else if (ownership === 'ambiguous') {
      planBlockers.push({
        code: 'OWNERSHIP_AMBIGUOUS',
        message: `Blog post ${expectedSlug} exists but is not demonstrably owned by this demo seed.`,
        severity: 'BLOCKER',
      });
    }
    if (!input.manifest.approvals[definition.approval].approved) {
      planBlockers.push({
        code: 'APPROVAL_PENDING',
        message: `Blog article ${definition.slug} content is not approved.`,
        severity: 'BLOCKER',
      });
    }
    return {
      key: definition.key,
      slug: definition.slug,
      action:
        planBlockers.length > 0
          ? ('blocked' as const)
          : ownership === 'absent'
            ? ('create' as const)
            : ('update' as const),
      existingId: existing?.id ?? null,
      payload: {
        title: definition.title,
        excerpt: definition.excerpt,
        content: definition.content,
        authorName: definition.authorName,
        publish: definition.publish,
        coverAssetKey: definition.coverAssetKey,
      },
      blockers: planBlockers,
    };
  });

  const mediaPlans = input.manifest.media.map((definition) => {
    const expectedName = expectedMediaOriginalName(definition);
    const existing = mediaRows.get(expectedName) ?? null;
    const ownership = mediaOwnership(existing, expectedName);
    const asset = input.assets[definition.key] ?? {
      path: '',
      exists: false,
      sizeBytes: null,
      sha256: null,
      error: null,
    };
    const planBlockers: DemoSeedPlan['blockers'] = [];
    if (ownership === 'ambiguous' || ownership === 'manually-edited') {
      planBlockers.push({
        code: 'OWNERSHIP_AMBIGUOUS',
        message: `Media ${expectedName} exists but is not demonstrably owned by this demo seed.`,
        severity: 'BLOCKER',
      });
    }
    if (!input.manifest.approvals[definition.approval].approved) {
      planBlockers.push({
        code: 'MEDIA_ASSET_APPROVAL_MISSING',
        message: `Media asset ${definition.key} is not approved.`,
        severity: 'BLOCKER',
      });
    }
    if (asset.error !== null) {
      planBlockers.push({
        code: 'ASSET_VALIDATION_FAILED',
        message: `Media asset ${definition.key} failed validation: ${asset.error}`,
        severity: 'BLOCKER',
      });
    } else if (!asset.exists || asset.sha256 === null) {
      planBlockers.push({
        code: 'MEDIA_ASSET_MISSING',
        message:
          `Approved media asset file is missing or unverified: ${asset.path || definition.fileName}. ` +
          'The demo seed does not reuse owned media without the approved source bytes present.',
        severity: 'BLOCKER',
      });
    } else if (
      ownership === 'owned' &&
      !mediaProvenanceMatches(existing, asset)
    ) {
      planBlockers.push({
        code: 'MEDIA_PROVENANCE_MISMATCH',
        message:
          `Media ${expectedName} is demo-owned but its persisted source/processed/thumbnail provenance does not match the approved asset hash ${asset.sha256}. ` +
          'Refusing to reuse prior content; inspect or recreate the media row.',
        severity: 'BLOCKER',
      });
    }
    return {
      key: definition.key,
      path: asset.path,
      exists: asset.exists,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      action:
        planBlockers.length > 0
          ? ('blocked' as const)
          : ownership === 'owned'
            ? ('reuse' as const)
            : ('create' as const),
      existingId: existing?.id ?? null,
      blockers: planBlockers,
    };
  });

  for (const item of [...campaignPlans, ...blogPlans, ...mediaPlans]) {
    blockers.push(...item.blockers);
  }

  const reusedOwnedMediaIds = new Set(
    input.manifest.media.flatMap((definition) => {
      const expectedName = expectedMediaOriginalName(definition);
      const row = mediaRows.get(expectedName) ?? null;
      const asset = input.assets[definition.key];
      return row &&
        mediaOwnership(row, expectedName) === 'owned' &&
        asset &&
        mediaProvenanceMatches(row, asset)
        ? [row.id]
        : [];
    }),
  );
  const affectedMedia = input.publishedMedia.filter(
    (row) => !reusedOwnedMediaIds.has(row.id),
  );
  const acknowledgedMediaIds = [
    ...input.options.mediaReconciliationAckIds,
  ].sort();
  const affectedMediaIds = affectedMedia.map((row) => row.id).sort();
  const matchesAck =
    acknowledgedMediaIds.length === affectedMediaIds.length &&
    acknowledgedMediaIds.every(
      (id, index) => id === affectedMediaIds[index],
    );
  if (input.options.publish && affectedMedia.length > 0) {
    if (!input.manifest.approvals.media_reconciliation.approved) {
      blockers.push({
        code: 'MEDIA_RECONCILIATION_NOT_ACKNOWLEDGED',
        message: `Reconciliation would clear publishedAt on ${affectedMedia.length} currently published media record(s), including soft-deleted/non-demo rows. Explicit media reconciliation approval is required.`,
        severity: 'BLOCKER',
      });
    }
    if (!matchesAck) {
      blockers.push({
        code: 'MEDIA_RECONCILIATION_SET_MISMATCH',
        message:
          'HOMEPAGE_DEMO_MEDIA_ACK_IDS must exactly match the affected media IDs shown in the plan, including soft-deleted/non-demo rows.',
        severity: 'BLOCKER',
      });
    }
  }

  const explicitSlugs = new Set<string>();
  for (const campaign of input.manifest.campaigns) {
    const selection = campaign.selection.products;
    if (selection?.kind !== 'explicit') continue;
    for (const slug of selection.slugs) {
      explicitSlugs.add(slug);
    }
  }
  for (const slug of explicitSlugs) {
    const product = input.candidates.productsBySlug?.[slug];
    if (!product) {
      blockers.push({
        code: 'EXPLICIT_PRODUCT_UNAVAILABLE',
        message: `Explicit campaign product ${slug} is not available in the public catalog.`,
        severity: 'BLOCKER',
      });
    } else if (!product.inStock) {
      blockers.push({
        code: 'EXPLICIT_PRODUCT_UNAVAILABLE',
        message: `Explicit campaign product ${slug} is not currently in stock.`,
        severity: 'BLOCKER',
      });
    }
  }

  candidateGuards(input.candidates, blockers, warnings);

  const readyProducts = input.candidates.products.slice(0, 8);
  if (
    readyProducts.some((product) => product.callForPrice) &&
    !input.manifest.approvals.call_for_price_ready_to_ship.approved
  ) {
    blockers.push({
      code: 'CALL_FOR_PRICE_NOT_APPROVED',
      message:
        'READY_TO_SHIP candidates include a CALL_FOR_PRICE product; explicit content approval is required.',
      severity: 'BLOCKER',
    });
  }

  const ss245 = input.ss245Post;
  if (ss245 === null) {
    warnings.push({
      code: 'SS245_POST_CHANGED',
      message: 'The SS-245 test post was not found; the demo tool will not recreate or modify it.',
      severity: 'WARNING',
    });
  } else if (ss245.status !== 'PUBLISHED') {
    warnings.push({
      code: 'SS245_POST_CHANGED',
      message: `The SS-245 test post is ${ss245.status}, not PUBLISHED; the demo tool will not alter it.`,
      severity: 'WARNING',
    });
  } else {
    notes.push(
      `SS-245 post ${ss245.slug} remains PUBLISHED and is retained without modification.`,
    );
  }

  const sections = input.manifest.sections.map(sectionPreview);
  const publish = input.options.publish;
  const plan: DemoSeedPlan = {
    generatedAt: input.generatedAt,
    identity: input.identity,
    nodeEnv: input.options.nodeEnv ?? '',
    approvals: Object.values(input.manifest.approvals),
    baseline: input.baseline,
    candidates: input.candidates,
    campaigns: campaignPlans,
    blog: blogPlans,
    media: mediaPlans,
    sections,
    blockers,
    warnings,
    notes,
    retained: {
      ss245Post: ss245
        ? { id: ss245.id, slug: ss245.slug, status: ss245.status }
        : null,
      currentlyPublishedMedia: input.baseline.counts.publishedMerchMedia,
    },
    applyPermitted: blockers.length === 0,
    draft: {
      action: draft === null ? 'create' : 'replace',
      sourceRevision: draft?.revision ?? null,
      requiresBackup: draft !== null,
    },
    publication: {
      action: publish ? 'publish' : 'none',
      supersedes: publish ? publishedVersions : [],
      currentPublishedVersions: publishedVersions,
      requiresAck: publish && publishedVersions.length > 0,
    },
    mediaReconciliation: {
      affected: affectedMedia,
      acknowledgedIds: acknowledgedMediaIds,
      matchesAck,
    },
    backup: {
      required: draft !== null,
      directory: input.options.backupDir,
      reason:
        draft !== null
          ? 'An existing draft must be backed up before replacement.'
          : null,
    },
    publicApiBaseUrl: publicBaseCheck.valid
      ? input.options.publicApiBaseUrl
      : null,
  };

  return plan;
}

function planCampaign(
  definition: DemoCampaignDefinition,
  input: DemoSeedPlanInput,
  campaignRows: Map<string, DemoCampaignRow>,
) {
  const existing = campaignRows.get(definition.internalName) ?? null;
  const ownership = campaignOwnership(existing, definition.internalName);
  const planBlockers: DemoSeedPlan['blockers'] = [];
  if (ownership === 'manually-edited') {
    planBlockers.push({
      code: 'OWNERSHIP_MANUALLY_EDITED',
      message: `Campaign ${definition.internalName} was manually edited after demo creation; the tool will not overwrite it.`,
      severity: 'BLOCKER',
    });
  } else if (ownership === 'ambiguous') {
    planBlockers.push({
      code: 'OWNERSHIP_AMBIGUOUS',
      message: `Campaign ${definition.internalName} exists but is not demonstrably owned by this demo seed.`,
      severity: 'BLOCKER',
    });
  }
  if (!input.manifest.approvals[definition.approval].approved) {
    planBlockers.push({
      code: 'APPROVAL_PENDING',
      message: `Campaign content ${definition.key} is not approved.`,
      severity: 'BLOCKER',
    });
  }
  return {
    key: definition.key,
    internalName: definition.internalName,
    action:
      planBlockers.length > 0
        ? ('blocked' as const)
        : ownership === 'absent'
          ? ('create' as const)
          : ('update' as const),
    existingId: existing?.id ?? null,
    payload: campaignPayload(definition, input.candidates),
    blockers: planBlockers,
  };
}

export function campaignPayload(
  definition: DemoCampaignDefinition,
  candidates: DemoSeedCandidates,
): CreateMerchCampaignInput {
  const productIds = new Set<string>();
  const categoryIds = new Set<string>();
  const brandIds = new Set<string>();

  if (definition.selection.categories) {
    for (const category of candidates.categories.slice(
      0,
      definition.selection.categories.limit,
    )) {
      categoryIds.add(category.id);
    }
  }
  if (definition.selection.brands) {
    for (const brand of candidates.brands.slice(
      0,
      definition.selection.brands.limit,
    )) {
      brandIds.add(brand.id);
    }
  }
  if (definition.selection.products?.kind === 'newest-in-stock') {
    for (const product of candidates.products.slice(
      0,
      definition.selection.products.limit,
    )) {
      productIds.add(product.id);
    }
  }
  if (definition.selection.products?.kind === 'explicit') {
    for (const slug of definition.selection.products.slugs) {
      const product = candidates.productsBySlug?.[slug];
      if (product) {
        productIds.add(product.id);
      }
    }
  }
  if (definition.selection.products?.kind === 'brand-mix') {
    for (const brand of candidates.brands.slice(
      0,
      definition.selection.products.brandsLimit,
    )) {
      brandIds.add(brand.id);
      for (const product of (candidates.productsByBrand[brand.slug] ?? []).slice(
        0,
        definition.selection.products.perBrand,
      )) {
        productIds.add(product.id);
      }
    }
  }

  return {
    internalName: definition.internalName,
    type: definition.type,
    titleFa: definition.copy.titleFa,
    eyebrowFa: definition.copy.eyebrowFa,
    subtitleFa: definition.copy.subtitleFa,
    descriptionFa: definition.copy.descriptionFa,
    ctaLabelFa: definition.copy.ctaLabelFa,
    cta: definition.cta,
    isEnabled: true,
    startsAt: definition.schedule.startsAt,
    endsAt: definition.schedule.endsAt,
    priority: 0,
    productIds: [...productIds].slice(0, 12),
    categoryIds: [...categoryIds].slice(0, 6),
    brandIds: [...brandIds].slice(0, 5),
  };
}

function candidateGuards(
  candidates: DemoSeedCandidates,
  blockers: DemoSeedPlan['blockers'],
  warnings: DemoSeedPlan['warnings'],
): void {
  if (candidates.products.length === 0) {
    blockers.push({
      code: 'CATALOG_CANDIDATES_INSUFFICIENT',
      message: 'No eligible in-stock published products are available for READY_TO_SHIP.',
      severity: 'BLOCKER',
    });
  } else if (candidates.products.length < 8) {
    warnings.push({
      code: 'CATALOG_CANDIDATES_INSUFFICIENT',
      message: `Only ${candidates.products.length} eligible in-stock products are available; READY_TO_SHIP will render fewer than eight.`,
      severity: 'WARNING',
    });
  }
  if (candidates.categories.length === 0) {
    blockers.push({
      code: 'CATALOG_CANDIDATES_INSUFFICIENT',
      message: 'No published categories are available for category discovery/spotlight.',
      severity: 'BLOCKER',
    });
  }
  if (candidates.brands.length === 0) {
    blockers.push({
      code: 'CATALOG_CANDIDATES_INSUFFICIENT',
      message: 'No published brands are available for brand showcase.',
      severity: 'BLOCKER',
    });
  } else if (
    candidates.brands.every(
      (brand) => (candidates.productsByBrand[brand.slug] ?? []).length === 0,
    )
  ) {
    blockers.push({
      code: 'CATALOG_CANDIDATES_INSUFFICIENT',
      message: 'No published products are available for the selected brands.',
      severity: 'BLOCKER',
    });
  }
}

function sectionPreview(section: DemoSectionDefinition): DemoSeedSectionPreview {
  const campaignKeys =
    'campaignKey' in section
      ? [section.campaignKey]
      : 'campaignKeys' in section
        ? section.campaignKeys
        : [];
  const postKeys = 'postKeys' in section ? section.postKeys : [];
  return {
    key: section.key,
    type: section.type,
    order: section.order,
    isVisible: section.isVisible,
    campaignKeys,
    postKeys,
    detail: describeSection(section),
  };
}

function describeSection(section: DemoSectionDefinition): string {
  switch (section.type) {
    case 'TRUST_STRIP':
      return `${section.items.length} pending trust items`;
    case 'READY_TO_SHIP':
      return `limit ${section.limit}`;
    case 'PRODUCT_RAIL':
      return `${section.sort}, limit ${section.limit}, inStockOnly=${section.inStockOnly}`;
    case 'BLOG_FEATURE':
      return `manual posts: ${section.postKeys.join(', ')}`;
    case 'CATEGORY_SPOTLIGHT':
      return `campaign ${section.campaignKey}; secondary=null`;
    case 'BRAND_SHOWCASE':
      return `campaign ${section.campaignKey}; ${section.productsPerBrand} products/brand`;
    case 'OFFER_STRIP':
      return `campaign ${section.campaignKey}; fallback=${section.fallback}`;
    default:
      return 'resolver-driven';
  }
}

function mediaProvenanceMatches(
  row: DemoMediaRow | null,
  asset: { exists: boolean; sha256: string | null },
): boolean {
  return (
    row !== null &&
    asset.exists &&
    asset.sha256 !== null &&
    row.sourceSha256 === asset.sha256 &&
    row.processedSha256 !== null &&
    row.processedSha256 !== undefined &&
    row.thumbnailSha256 !== null &&
    row.thumbnailSha256 !== undefined
  );
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function groupCampaigns(rows: DemoCampaignRow[]): Map<string, DemoCampaignRow> {
  return new Map(rows.map((row) => [row.internalName, row]));
}

function groupBlogPosts(rows: DemoBlogRow[]): Map<string, DemoBlogRow> {
  return new Map(rows.map((row) => [row.slug, row]));
}

function groupMedia(rows: DemoMediaRow[]): Map<string, DemoMediaRow> {
  return new Map(rows.map((row) => [row.originalName, row]));
}

export interface SectionReferenceIds {
  campaignIds: Record<string, string>;
  blogPostIds: Record<string, string>;
  spotlightCategoryId: string;
}

/**
 * Builds the final draft sections after campaign/blog/media creation. Throws
 * rather than emitting a payload with missing references.
 */
export function buildHomepageSections(
  manifest: DemoSeedManifest,
  refs: SectionReferenceIds,
): HomepageDraftSection[] {
  return manifest.sections.map((section): HomepageDraftSection => {
    switch (section.type) {
      case 'HERO_CAROUSEL':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            campaignIds: section.campaignKeys.map((key) =>
              requiredId(refs.campaignIds, key, 'campaign'),
            ),
          },
        };
      case 'TRUST_STRIP':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: { items: section.items },
        };
      case 'CATEGORY_DISCOVERY':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            campaignId: requiredId(
              refs.campaignIds,
              section.campaignKey,
              'campaign',
            ),
          },
        };
      case 'OFFER_STRIP':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            campaignId: requiredId(
              refs.campaignIds,
              section.campaignKey,
              'campaign',
            ),
            fallback: section.fallback,
          },
        };
      case 'CATEGORY_SPOTLIGHT':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            campaignId: requiredId(
              refs.campaignIds,
              section.campaignKey,
              'campaign',
            ),
            categoryId: refs.spotlightCategoryId,
            secondaryCategoryId: section.secondaryCategoryId,
          },
        };
      case 'READY_TO_SHIP':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            limit: section.limit,
            ...(section.title === null ? {} : { title: section.title }),
            ...(section.subtitle === null ? {} : { subtitle: section.subtitle }),
          },
        };
      case 'PRODUCT_RAIL':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            title: section.title,
            ...(section.subtitle === null ? {} : { subtitle: section.subtitle }),
            ...(section.actionHref === null
              ? {}
              : { actionHref: section.actionHref }),
            source: {
              kind: 'query',
              categoryId: null,
              brandId: null,
              sort: section.sort,
              limit: section.limit,
              inStockOnly: section.inStockOnly,
            },
          },
        };
      case 'BRAND_SHOWCASE':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            campaignId: requiredId(
              refs.campaignIds,
              section.campaignKey,
              'campaign',
            ),
            productsPerBrand: section.productsPerBrand,
          },
        };
      case 'BLOG_FEATURE':
        return {
          key: section.key,
          type: section.type,
          order: section.order,
          isVisible: section.isVisible,
          settings: {
            source: 'manual',
            postIds: section.postKeys.map((key) =>
              requiredId(refs.blogPostIds, key, 'blog post'),
            ),
          },
        };
    }
  });
}

function requiredId(
  ids: Record<string, string>,
  key: string,
  kind: string,
): string {
  const id = ids[key];
  if (!id) {
    throw new Error(`Missing ${kind} id for manifest key ${key}.`);
  }
  return id;
}

export function selectedProducts(
  candidates: DemoSeedCandidates,
  limit: number,
): CatalogProductCardDto[] {
  return candidates.products.slice(0, limit);
}

export function selectedCategories(candidates: DemoSeedCandidates, limit: number) {
  return candidates.categories.slice(0, limit);
}

export function selectedBrands(candidates: DemoSeedCandidates, limit: number) {
  return candidates.brands.slice(0, limit);
}

export const DEMO_ACTOR = DEMO_SEED_ACTOR_ID;
