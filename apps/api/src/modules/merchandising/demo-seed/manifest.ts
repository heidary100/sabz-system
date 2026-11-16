import type {
  ApprovalDecision,
  ApprovalKey,
  DemoCampaignDefinition,
  DemoSeedManifest,
} from './types';
import {
  DEMO_BLOG_SLUG_PREFIX,
  DEMO_CAMPAIGN_PREFIX,
} from './constants';

/**
 * Content manifest for the homepage demo seed.
 *
 * All business-content decisions are PENDING. Placeholder copy is deliberately
 * obvious and must never be published until an operator marks the matching
 * approval as approved in a reviewed code change.
 *
 * This file is content, not the execution engine. It must not contain
 * fabricated delivery promises, warranty guarantees, support commitments or
 * invented editorial claims.
 */

const PENDING = 'PENDING APPROVAL — demo content placeholder';

function approval(
  key: ApprovalKey,
  label: string,
  kind: ApprovalDecision['kind'],
  note: string,
): ApprovalDecision {
  return { key, label, approved: false, kind, note };
}

export const DEMO_APPROVALS: Record<ApprovalKey, ApprovalDecision> = {
  hero_assets: approval(
    'hero_assets',
    'Four hero assets versus existing product photography',
    'business-content',
    'Choose the hero art direction and supply desktop/mobile files.',
  ),
  blog_articles: approval(
    'blog_articles',
    'Three demo blog articles and cover assets',
    'business-content',
    'Approve article copy, titles, bylines and cover files.',
  ),
  blog_cover_strategy: approval(
    'blog_cover_strategy',
    'Browser-accessible public URL strategy for blog covers',
    'technical',
    'Approve the public API base and merchandising-media delivery path.',
  ),
  draft_replacement: approval(
    'draft_replacement',
    'Replace the existing homepage draft with a backed-up demo draft',
    'technical',
    'Requires --replace-draft and a verified persistent backup.',
  ),
  publication_supersede: approval(
    'publication_supersede',
    'Supersede the current published homepage while retaining all history',
    'technical',
    'Requires --publish, --acknowledge-publication-replacement and the publish confirmation environment variable.',
  ),
  media_reconciliation: approval(
    'media_reconciliation',
    'Allow reconciliation to clear publishedAt on non-demo media',
    'technical',
    'Must be rechecked at apply time; a previous zero count is not authorization.',
  ),
  call_for_price_ready_to_ship: approval(
    'call_for_price_ready_to_ship',
    'Allow CALL_FOR_PRICE products in READY_TO_SHIP',
    'business-content',
    'Choose whether call-for-price cards are acceptable in the demo rail.',
  ),
  trust_claims: approval(
    'trust_claims',
    'Exact trust-strip business claims',
    'business-content',
    'Explicitly approve delivery, authenticity, defect-reporting and ordering claims.',
  ),
  campaign_copy_schedule: approval(
    'campaign_copy_schedule',
    'Campaign copy and schedule',
    'business-content',
    'Approve campaign text, CTA labels, dates and any non-generic section copy. No 2020 or timeless schedule is assumed.',
  ),
  docker_execution_method: approval(
    'docker_execution_method',
    'Documented one-off Docker execution method',
    'technical',
    'Approve the documented `docker compose run --rm --no-deps` invocation.',
  ),
  final_storefront_demo: approval(
    'final_storefront_demo',
    'Run the final demo against a synchronized storefront',
    'technical',
    'Approve the later customer-facing demonstration run.',
  ),
  public_api_base_url: approval(
    'public_api_base_url',
    'Browser-facing public API base URL',
    'technical',
    'Supply a non-localhost, non-Compose public origin for media and blog covers.',
  ),
  ss245_post_retention: approval(
    'ss245_post_retention',
    'Keep the existing SS-245 test blog post published',
    'business-content',
    'The tool never mutates this post; approve its continued presence in the demo.',
  ),
};

const campaigns: DemoCampaignDefinition[] = [
  {
    key: 'hero-primary',
    internalName: `${DEMO_CAMPAIGN_PREFIX}hero-primary`,
    type: 'EDITORIAL',
    copy: {
      titleFa: PENDING,
      eyebrowFa: null,
      subtitleFa: null,
      descriptionFa: null,
      ctaLabelFa: null,
    },
    cta: { kind: 'NONE' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: ['hero-primary-desktop', 'hero-primary-mobile'],
    selection: {},
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'hero-secondary',
    internalName: `${DEMO_CAMPAIGN_PREFIX}hero-secondary`,
    type: 'EDITORIAL',
    copy: {
      titleFa: PENDING,
      eyebrowFa: null,
      subtitleFa: null,
      descriptionFa: null,
      ctaLabelFa: null,
    },
    cta: { kind: 'NONE' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: ['hero-secondary-desktop', 'hero-secondary-mobile'],
    selection: {},
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'discovery',
    internalName: `${DEMO_CAMPAIGN_PREFIX}discovery`,
    type: 'CATEGORY',
    copy: {
      titleFa: PENDING,
      eyebrowFa: null,
      subtitleFa: null,
      descriptionFa: null,
      ctaLabelFa: null,
    },
    cta: { kind: 'NONE' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: [],
    selection: { categories: { kind: 'top-published', limit: 6 } },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'offer',
    internalName: `${DEMO_CAMPAIGN_PREFIX}offer`,
    type: 'DISCOUNT',
    copy: {
      titleFa: PENDING,
      eyebrowFa: null,
      subtitleFa: null,
      descriptionFa: null,
      ctaLabelFa: null,
    },
    cta: { kind: 'NONE' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: [],
    selection: { products: { kind: 'newest-in-stock', limit: 6 } },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'spotlight',
    internalName: `${DEMO_CAMPAIGN_PREFIX}spotlight`,
    type: 'EDITORIAL',
    copy: {
      titleFa: PENDING,
      eyebrowFa: null,
      subtitleFa: null,
      descriptionFa: null,
      ctaLabelFa: null,
    },
    cta: { kind: 'NONE' },
    schedule: { startsAt: null, endsAt: null },
    // Blog covers use the publication-gated media route; attaching them to
    // this campaign puts their IDs in the visible publication snapshot.
    mediaKeys: ['blog-cover-1', 'blog-cover-2', 'blog-cover-3'],
    // The homepage spotlight section publishes the first candidate category as
    // its primary category, so the referenced campaign must include it.
    selection: { categories: { kind: 'top-published', limit: 1 } },
    approval: 'campaign_copy_schedule',
  },
  {
    key: 'brands',
    internalName: `${DEMO_CAMPAIGN_PREFIX}brands`,
    type: 'BRAND',
    copy: {
      titleFa: PENDING,
      eyebrowFa: null,
      subtitleFa: null,
      descriptionFa: null,
      ctaLabelFa: null,
    },
    cta: { kind: 'NONE' },
    schedule: { startsAt: null, endsAt: null },
    mediaKeys: [],
    selection: {
      brands: { kind: 'top-published', limit: 4 },
      products: { kind: 'brand-mix', brandsLimit: 4, perBrand: 6 },
    },
    approval: 'campaign_copy_schedule',
  },
];

const media: DemoSeedManifest['media'] = [
  {
    key: 'hero-primary-desktop',
    fileName: 'hero-primary-desktop.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_DESKTOP',
    campaignKey: 'hero-primary',
    blogKey: null,
    altFa: PENDING,
    approval: 'hero_assets',
  },
  {
    key: 'hero-primary-mobile',
    fileName: 'hero-primary-mobile.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_MOBILE',
    campaignKey: 'hero-primary',
    blogKey: null,
    altFa: PENDING,
    approval: 'hero_assets',
  },
  {
    key: 'hero-secondary-desktop',
    fileName: 'hero-secondary-desktop.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_DESKTOP',
    campaignKey: 'hero-secondary',
    blogKey: null,
    altFa: PENDING,
    approval: 'hero_assets',
  },
  {
    key: 'hero-secondary-mobile',
    fileName: 'hero-secondary-mobile.jpg',
    mimeType: 'image/jpeg',
    slot: 'HERO_MOBILE',
    campaignKey: 'hero-secondary',
    blogKey: null,
    altFa: PENDING,
    approval: 'hero_assets',
  },
  {
    key: 'blog-cover-1',
    fileName: 'blog-cover-1.jpg',
    mimeType: 'image/jpeg',
    slot: 'EDITORIAL',
    campaignKey: 'spotlight',
    blogKey: 'demo-article-1',
    altFa: PENDING,
    approval: 'blog_articles',
  },
  {
    key: 'blog-cover-2',
    fileName: 'blog-cover-2.jpg',
    mimeType: 'image/jpeg',
    slot: 'EDITORIAL',
    campaignKey: 'spotlight',
    blogKey: 'demo-article-2',
    altFa: PENDING,
    approval: 'blog_articles',
  },
  {
    key: 'blog-cover-3',
    fileName: 'blog-cover-3.jpg',
    mimeType: 'image/jpeg',
    slot: 'EDITORIAL',
    campaignKey: 'spotlight',
    blogKey: 'demo-article-3',
    altFa: PENDING,
    approval: 'blog_articles',
  },
];

const blog: DemoSeedManifest['blog'] = [
  {
    key: 'demo-article-1',
    slug: `${DEMO_BLOG_SLUG_PREFIX}article-1`,
    title: PENDING,
    excerpt: null,
    content: '<p>PENDING APPROVAL — demo article placeholder</p>',
    authorName: null,
    coverAssetKey: 'blog-cover-1',
    publish: true,
    approval: 'blog_articles',
  },
  {
    key: 'demo-article-2',
    slug: `${DEMO_BLOG_SLUG_PREFIX}article-2`,
    title: PENDING,
    excerpt: null,
    content: '<p>PENDING APPROVAL — demo article placeholder</p>',
    authorName: null,
    coverAssetKey: 'blog-cover-2',
    publish: true,
    approval: 'blog_articles',
  },
  {
    key: 'demo-article-3',
    slug: `${DEMO_BLOG_SLUG_PREFIX}article-3`,
    title: PENDING,
    excerpt: null,
    content: '<p>PENDING APPROVAL — demo article placeholder</p>',
    authorName: null,
    coverAssetKey: 'blog-cover-3',
    publish: true,
    approval: 'blog_articles',
  },
];

export const DEMO_SEED_MANIFEST: DemoSeedManifest = {
  version: 1,
  approvals: DEMO_APPROVALS,
  campaigns,
  media,
  blog,
  sections: [
    {
      key: 'homepage-hero',
      type: 'HERO_CAROUSEL',
      order: 0,
      isVisible: true,
      campaignKeys: ['hero-primary', 'hero-secondary'],
    },
    {
      key: 'homepage-trust',
      type: 'TRUST_STRIP',
      order: 1,
      isVisible: true,
      items: [
        { icon: 'truck', title: 'PENDING APPROVAL — trust item 1' },
        { icon: 'shield', title: 'PENDING APPROVAL — trust item 2' },
        { icon: 'badge', title: 'PENDING APPROVAL — trust item 3' },
        { icon: 'support', title: 'PENDING APPROVAL — trust item 4' },
      ],
    },
    {
      key: 'homepage-categories',
      type: 'CATEGORY_DISCOVERY',
      order: 2,
      isVisible: true,
      campaignKey: 'discovery',
    },
    {
      key: 'homepage-offer',
      type: 'OFFER_STRIP',
      order: 3,
      isVisible: true,
      campaignKey: 'offer',
      fallback: 'featured',
    },
    {
      key: 'homepage-spotlight',
      type: 'CATEGORY_SPOTLIGHT',
      order: 4,
      isVisible: true,
      campaignKey: 'spotlight',
      secondaryCategoryId: null,
    },
    {
      key: 'homepage-ready',
      type: 'READY_TO_SHIP',
      order: 5,
      isVisible: true,
      limit: 8,
      title: 'آماده ارسال',
      subtitle: null,
    },
    {
      key: 'homepage-product-rail',
      type: 'PRODUCT_RAIL',
      order: 6,
      isVisible: true,
      title: 'محصولات منتخب',
      subtitle: null,
      actionHref: null,
      sort: 'newest',
      limit: 8,
      inStockOnly: true,
    },
    {
      key: 'homepage-brands',
      type: 'BRAND_SHOWCASE',
      order: 7,
      isVisible: true,
      campaignKey: 'brands',
      productsPerBrand: 4,
    },
    {
      key: 'homepage-blog',
      type: 'BLOG_FEATURE',
      order: 8,
      isVisible: true,
      postKeys: ['demo-article-1', 'demo-article-2', 'demo-article-3'],
    },
  ],
};

export function pendingApprovals(
  manifest: DemoSeedManifest = DEMO_SEED_MANIFEST,
): ApprovalDecision[] {
  return Object.values(manifest.approvals).filter((item) => !item.approved);
}
