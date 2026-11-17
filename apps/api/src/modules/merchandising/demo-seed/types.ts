import type {
  CatalogProductCardDto,
  CreateMerchCampaignInput,
  HomepageDraftSection,
  HomepagePublicationStatus,
  HomepageSectionType,
  MerchCampaignType,
  MerchCtaTarget,
  MerchMediaSlot,
  MerchTrustIcon,
  ProductRailSort,
} from '@sabz/types';

export interface DatabaseIdentity {
  systemIdentifier: string;
  databaseName: string;
  databaseOid: number;
  postgresVersion: string;
  fingerprint: string;
}

export type ApprovalKey =
  | 'hero_assets'
  | 'blog_articles'
  | 'blog_cover_strategy'
  | 'draft_replacement'
  | 'publication_supersede'
  | 'media_reconciliation'
  | 'call_for_price_ready_to_ship'
  | 'trust_claims'
  | 'campaign_copy_schedule'
  | 'docker_execution_method'
  | 'final_storefront_demo'
  | 'public_api_base_url'
  | 'ss245_post_retention';

export interface ApprovalDecision {
  key: ApprovalKey;
  label: string;
  approved: boolean;
  kind: 'technical' | 'business-content';
  note: string;
}

export interface DemoCampaignSelection {
  categories?: { kind: 'top-published'; limit: number };
  products?:
    | { kind: 'newest-in-stock'; limit: number }
    | { kind: 'brand-mix'; brandsLimit: number; perBrand: number }
    | { kind: 'explicit'; slugs: string[] };
  brands?: { kind: 'top-published'; limit: number };
}

export interface DemoCampaignDefinition {
  key: string;
  internalName: string;
  type: MerchCampaignType;
  copy: {
    titleFa: string;
    eyebrowFa: string | null;
    subtitleFa: string | null;
    descriptionFa: string | null;
    ctaLabelFa: string | null;
  };
  cta: MerchCtaTarget;
  schedule: { startsAt: string | null; endsAt: string | null };
  mediaKeys: string[];
  selection: DemoCampaignSelection;
  approval: ApprovalKey;
}

export interface DemoTrustItem {
  icon: MerchTrustIcon;
  title: string;
  body?: string;
}

export type DemoSectionDefinition =
  | {
      key: string;
      type: 'HERO_CAROUSEL';
      order: 0;
      isVisible: boolean;
      campaignKeys: string[];
    }
  | {
      key: string;
      type: 'TRUST_STRIP';
      order: 1;
      isVisible: boolean;
      items: DemoTrustItem[];
    }
  | {
      key: string;
      type: 'CATEGORY_DISCOVERY';
      order: 2;
      isVisible: boolean;
      campaignKey: string;
    }
  | {
      key: string;
      type: 'OFFER_STRIP';
      order: 3;
      isVisible: boolean;
      campaignKey: string;
      fallback: 'featured' | 'hide';
    }
  | {
      key: string;
      type: 'CATEGORY_SPOTLIGHT';
      order: 4;
      isVisible: boolean;
      campaignKey: string;
      secondaryCategoryId: string | null;
    }
  | {
      key: string;
      type: 'READY_TO_SHIP';
      order: 5;
      isVisible: boolean;
      limit: number;
      title: string | null;
      subtitle: string | null;
    }
  | {
      key: string;
      type: 'PRODUCT_RAIL';
      order: 6;
      isVisible: boolean;
      title: string;
      subtitle: string | null;
      actionHref: string | null;
      sort: ProductRailSort;
      limit: number;
      inStockOnly: boolean;
    }
  | {
      key: string;
      type: 'BRAND_SHOWCASE';
      order: 7;
      isVisible: boolean;
      campaignKey: string;
      productsPerBrand: number;
    }
  | {
      key: string;
      type: 'BLOG_FEATURE';
      order: 8;
      isVisible: boolean;
      postKeys: string[];
    };

export interface DemoMediaAssetDefinition {
  key: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  slot: MerchMediaSlot;
  campaignKey: string | null;
  blogKey: string | null;
  altFa: string;
  approval: ApprovalKey;
}

export interface DemoBlogArticleDefinition {
  key: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  authorName: string | null;
  coverAssetKey: string | null;
  publish: boolean;
  approval: ApprovalKey;
}

export interface DemoSeedManifest {
  version: 1;
  approvals: Record<ApprovalKey, ApprovalDecision>;
  campaigns: DemoCampaignDefinition[];
  sections: DemoSectionDefinition[];
  media: DemoMediaAssetDefinition[];
  blog: DemoBlogArticleDefinition[];
}

/**
 * Durable, immutable operation identity. This is persisted in the operation
 * journal and re-derived on every retry. Mutable database state is excluded.
 */
export interface DemoSeedIntentPayload {
  version: 1;
  operationId: string;
  identity: DatabaseIdentity;
  manifestHash: string;
  planHash: string;
  publicationMode: 'draft' | 'publish';
  assets: Array<{
    key: string;
    fileName: string;
    mimeType: string;
    slot: string;
    exists: boolean;
    sizeBytes: number | null;
    sha256: string | null;
    error: string | null;
  }>;
  mediaReconciliationAckIds: string[];
  replaceDraft: boolean;
  publish: boolean;
  acknowledgePublicationReplacement: boolean;
  publicApiBaseUrl: string | null;
  manifest: DemoSeedManifest;
}

/**
 * Mutable planning baseline whose change materially alters the operation.
 * Required to be identical for an incomplete retry; completed replay ignores
 * it because the completed operation itself changes this baseline.
 */
export interface DemoSeedBaselineIntent {
  draft: DemoDraftSnapshot | null;
  publications: DemoPublicationSnapshot[];
  candidates: {
    products: string[];
    categories: Array<{
      id: string;
      slug: string;
      publishedProductCount: number;
    }>;
    brands: Array<{
      id: string;
      slug: string;
      publishedProductCount: number;
    }>;
    productsByBrand: Record<string, string[]>;
  };
  campaignPayloads: Array<{
    key: string;
    internalName: string;
    payload: CreateMerchCampaignInput;
  }>;
  sections: DemoSeedSectionPreview[];
  spotlightCategoryId: string | null;
  mediaReconciliation: {
    affectedIds: string[];
    acknowledgedIds: string[];
    matchesAck: boolean;
  };
  publication: {
    action: 'none' | 'publish';
    supersedes: number[];
    currentPublishedVersions: number[];
    requiresAck: boolean;
  };
  draftPlan: {
    action: 'none' | 'create' | 'replace';
    sourceRevision: number | null;
    requiresBackup: boolean;
  };
  publicApiBaseUrl: string | null;
}

/** JSON persisted in the operation journal; hashes are stored separately. */
export interface DemoSeedJournalIntent {
  content: DemoSeedIntentPayload;
  baseline: DemoSeedBaselineIntent;
}

export interface DemoDraftSnapshot {
  revision: number;
  schemaVersion: number;
  sections: HomepageDraftSection[];
  updatedAt: string;
}

export interface DemoPublicationSnapshot {
  id: string;
  version: number;
  status: HomepagePublicationStatus;
  publishedAt: string | null;
}

export interface DemoCampaignRow {
  id: string;
  internalName: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface DemoBlogRow {
  id: string;
  slug: string;
  status: string;
  createdBy: string | null;
  updatedBy: string | null;
  publishedAt: string | null;
}

export interface DemoMediaRow {
  id: string;
  originalName: string;
  createdBy: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  /** Demo provenance; null/absent for legacy or ordinary media. */
  sourceSha256?: string | null;
  processedSha256?: string | null;
  thumbnailSha256?: string | null;
}

export interface DemoSeedBaseline {
  draft: DemoDraftSnapshot | null;
  publications: DemoPublicationSnapshot[];
  counts: {
    campaigns: number;
    merchMedia: number;
    publishedMerchMedia: number;
    blogPosts: number;
    publishedBlogPosts: number;
    products: number;
    publishedProducts: number;
  };
}

export interface DemoCategoryCandidate {
  id: string;
  name: string;
  slug: string;
  publishedProductCount: number;
}

export interface DemoBrandCandidate {
  id: string;
  name: string;
  slug: string;
  publishedProductCount: number;
}

export interface DemoSeedCandidates {
  categories: DemoCategoryCandidate[];
  brands: DemoBrandCandidate[];
  products: CatalogProductCardDto[];
  productsBySlug?: Record<string, CatalogProductCardDto>;
  productsByBrand: Record<string, CatalogProductCardDto[]>;
}

export type DemoSeedBlockerCode =
  | 'NODE_ENV_NOT_DEVELOPMENT'
  | 'CONFIRMATION_MISSING'
  | 'PUBLISH_CONFIRMATION_MISSING'
  | 'EXPECTED_FINGERPRINT_MISSING'
  | 'FINGERPRINT_MISMATCH'
  | 'APPROVAL_PENDING'
  | 'DRAFT_SCHEMA_UNSUPPORTED'
  | 'DRAFT_REPLACEMENT_FLAG_MISSING'
  | 'PUBLICATION_REPLACEMENT_ACK_MISSING'
  | 'PUBLICATION_STATE_CHANGED'
  | 'DRAFT_REVISION_CHANGED'
  | 'OWNERSHIP_AMBIGUOUS'
  | 'OWNERSHIP_MANUALLY_EDITED'
  | 'MEDIA_ASSET_MISSING'
  | 'MEDIA_ASSET_APPROVAL_MISSING'
  | 'PUBLIC_API_BASE_INVALID'
  | 'CONTENT_INCOMPLETE'
  | 'ASSET_VALIDATION_FAILED'
  | 'MEDIA_RECONCILIATION_SET_MISMATCH'
  | 'MEDIA_PROVENANCE_MISMATCH'
  | 'BLOG_ARTICLE_PUBLISH_REQUIRED'
  | 'BLOG_ACTIVATION_REQUIRES_PUBLICATION'
  | 'CATALOG_CANDIDATES_INSUFFICIENT'
  | 'EXPLICIT_PRODUCT_UNAVAILABLE'
  | 'CALL_FOR_PRICE_NOT_APPROVED'
  | 'MEDIA_RECONCILIATION_NOT_ACKNOWLEDGED'
  | 'SS245_POST_CHANGED';

export interface DemoSeedBlocker {
  code: DemoSeedBlockerCode;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export type DemoSeedRecordAction = 'create' | 'update' | 'reuse' | 'blocked';

export interface DemoSeedCampaignPlan {
  key: string;
  internalName: string;
  action: DemoSeedRecordAction;
  existingId: string | null;
  payload: CreateMerchCampaignInput;
  blockers: DemoSeedBlocker[];
}

export interface DemoSeedBlogPlan {
  key: string;
  slug: string;
  action: DemoSeedRecordAction;
  existingId: string | null;
  payload: {
    title: string;
    excerpt: string | null;
    content: string;
    authorName: string | null;
    publish: boolean;
    coverAssetKey: string | null;
  };
  blockers: DemoSeedBlocker[];
}

export interface DemoSeedMediaPlan {
  key: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  sha256: string | null;
  action: DemoSeedRecordAction;
  existingId: string | null;
  blockers: DemoSeedBlocker[];
}

export interface DemoSeedSectionPreview {
  key: string;
  type: HomepageSectionType;
  order: number;
  isVisible: boolean;
  campaignKeys: string[];
  postKeys: string[];
  detail: string;
}

export interface DemoSeedPlan {
  generatedAt: string;
  identity: DatabaseIdentity;
  nodeEnv: string;
  approvals: ApprovalDecision[];
  baseline: DemoSeedBaseline;
  candidates: DemoSeedCandidates;
  campaigns: DemoSeedCampaignPlan[];
  blog: DemoSeedBlogPlan[];
  media: DemoSeedMediaPlan[];
  sections: DemoSeedSectionPreview[];
  blockers: DemoSeedBlocker[];
  warnings: DemoSeedBlocker[];
  notes: string[];
  retained: {
    ss245Post: { id: string; slug: string; status: string } | null;
    currentlyPublishedMedia: number;
  };
  applyPermitted: boolean;
  draft: {
    action: 'none' | 'create' | 'replace';
    sourceRevision: number | null;
    requiresBackup: boolean;
  };
  publication: {
    action: 'none' | 'publish';
    supersedes: number[];
    currentPublishedVersions: number[];
    requiresAck: boolean;
  };
  mediaReconciliation: {
    affected: DemoMediaRow[];
    acknowledgedIds: string[];
    matchesAck: boolean;
  };
  backup: {
    required: boolean;
    directory: string;
    reason: string | null;
  };
  publicApiBaseUrl: string | null;
}

export interface DemoSeedOptions {
  nodeEnv: string | undefined;
  operationId: string;
  mediaReconciliationAckIds: string[];
  confirm: boolean;
  publishConfirm: boolean;
  expectedFingerprint: string | null;
  publicApiBaseUrl: string | null;
  assetsDir: string;
  backupDir: string;
  replaceDraft: boolean;
  publish: boolean;
  acknowledgePublicationReplacement: boolean;
}

export interface DemoSeedAssetState {
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  sha256: string | null;
  error: string | null;
}

export interface DemoSeedPlanInput {
  generatedAt: string;
  identity: DatabaseIdentity;
  manifest: DemoSeedManifest;
  options: DemoSeedOptions;
  baseline: DemoSeedBaseline;
  campaigns: DemoCampaignRow[];
  blogPosts: DemoBlogRow[];
  media: DemoMediaRow[];
  ss245Post: DemoBlogRow | null;
  publishedMedia: DemoMediaRow[];
  candidates: DemoSeedCandidates;
  assets: Record<string, DemoSeedAssetState>;
}

export interface DemoSeedReadRepository {
  readBaseline(): Promise<DemoSeedBaseline>;
  readCampaignsByInternalNames(internalNames: string[]): Promise<DemoCampaignRow[]>;
  readBlogPostsBySlugs(slugs: string[]): Promise<DemoBlogRow[]>;
  readMediaByOriginalNames(originalNames: string[]): Promise<DemoMediaRow[]>;
  readPublishedMedia(): Promise<DemoMediaRow[]>;
  readProducts(limit: number): Promise<CatalogProductCardDto[]>;
  readProductsBySlugs(slugs: string[]): Promise<CatalogProductCardDto[]>;
  readCategories(limit: number): Promise<DemoCategoryCandidate[]>;
  readBrands(limit: number, perBrand: number): Promise<{
    brands: DemoBrandCandidate[];
    productsByBrand: Record<string, CatalogProductCardDto[]>;
  }>;
  readSs245Post(): Promise<DemoBlogRow | null>;
}

export interface DemoDraftApplyResult {
  revision: number;
  publicationVersion: number | null;
  publicationId: string | null;
  supersededVersions: number[];
}

export interface DemoSeedOperationResult {
  campaigns: Record<string, string>;
  media: Record<string, string>;
  blog: Record<string, string>;
  backup: { path: string; checksum: string; sizeBytes: number } | null;
  draft: DemoDraftApplyResult;
}

/**
 * The writer accepts only manifest keys. It derives content, payloads, asset
 * hashes, media IDs, cover URLs and section references from its sealed plan and
 * current demo-owned rows. Callers cannot inject arbitrary sections or IDs.
 */
export interface DemoSeedWriteGateway {
  upsertCampaign(
    definitionKey: string,
  ): Promise<{ id: string; action: 'create' | 'update' | 'reuse' }>;
  /** Read-only storage identity for journaling before the media mutation. */
  mediaStorageIdentity(definitionKey: string): Promise<{
    action: 'create' | 'reuse';
    storageKey: string;
    thumbnailKey: string | null;
  }>;
  uploadOrReuseMedia(definitionKey: string): Promise<{
    id: string;
    action: 'create' | 'reuse' | 'recovered';
    storageAction: 'written' | 'reused-verified-orphan' | 'reused-row';
    storageKey: string;
    thumbnailKey: string | null;
  }>;
  upsertBlogPost(
    definitionKey: string,
  ): Promise<{ id: string; action: 'create' | 'update' | 'reuse' }>;
  applyDraftAndPublication(): Promise<DemoDraftApplyResult>;
}
