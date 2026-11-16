import type { CatalogProductCardDto } from '@sabz/types';
import { DEMO_SEED_MANIFEST } from './manifest';
import { expectedMediaOriginalName } from './ownership';
import type {
  ApprovalKey,
  DatabaseIdentity,
  DemoBlogRow,
  DemoCampaignRow,
  DemoMediaRow,
  DemoSeedBaseline,
  DemoSeedCandidates,
  DemoSeedManifest,
  DemoSeedOptions,
  DemoSeedPlanInput,
  DemoSeedWriteGateway,
} from './types';

export const HISTORICAL_IDENTITY: DatabaseIdentity = {
  systemIdentifier: '7689483372718039078',
  databaseName: 'sabz',
  databaseOid: 16384,
  postgresVersion: '16.15',
  fingerprint: 'dca02c03f09d18e68317136f85e643c0b80c8776c6c558fca24d67495103a7be',
};

export const DEMO_ACTOR = 'homepage-demo-seed';

export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function product(
  n: number,
  overrides: Partial<CatalogProductCardDto> = {},
): CatalogProductCardDto {
  return {
    id: uuid(1000 + n),
    name: `Product ${n}`,
    slug: `product-${n}`,
    condition: 'NEW',
    brand: { name: `Brand ${n % 4}`, slug: `brand-${n % 4}` },
    category: { name: `Category ${n % 6}`, slug: `category-${n % 6}` },
    priceFrom: '100000',
    compareAtPrice: null,
    callForPrice: false,
    promotionEndsAt: null,
    variantCount: 1,
    inStock: true,
    ratingAverage: null,
    ratingCount: 0,
    primaryImageUrl: null,
    primaryThumbnailUrl: null,
    ...overrides,
  };
}

export function candidates(): DemoSeedCandidates {
  const products = Array.from({ length: 8 }, (_, index) => product(index + 1));
  const categories = Array.from({ length: 6 }, (_, index) => ({
    id: uuid(2000 + index),
    name: `Category ${index}`,
    slug: `category-${index}`,
    publishedProductCount: 10 - index,
  }));
  const brands = Array.from({ length: 4 }, (_, index) => ({
    id: uuid(3000 + index),
    name: `Brand ${index}`,
    slug: `brand-${index}`,
    publishedProductCount: 8 - index,
  }));
  const productsByBrand: DemoSeedCandidates['productsByBrand'] = {};
  for (const [index, brand] of brands.entries()) {
    productsByBrand[brand.slug] = [product(20 + index), product(30 + index)];
  }
  return { categories, brands, products, productsByBrand };
}

export function baseline(): DemoSeedBaseline {
  return {
    draft: {
      revision: 3,
      schemaVersion: 1,
      sections: [],
      updatedAt: '2026-11-10T20:50:15.442Z',
    },
    publications: [
      {
        id: uuid(4001),
        version: 1,
        status: 'SUPERSEDED',
        publishedAt: '2026-11-10T15:17:07.426Z',
      },
      {
        id: uuid(4002),
        version: 2,
        status: 'SUPERSEDED',
        publishedAt: '2026-11-10T20:46:37.883Z',
      },
      {
        id: uuid(4003),
        version: 3,
        status: 'PUBLISHED',
        publishedAt: '2026-11-10T20:50:24.768Z',
      },
    ],
    counts: {
      campaigns: 1,
      merchMedia: 0,
      publishedMerchMedia: 0,
      blogPosts: 1,
      publishedBlogPosts: 1,
      products: 1101,
      publishedProducts: 1095,
    },
  };
}

export function approvedManifest(): DemoSeedManifest {
  const manifest = JSON.parse(
    JSON.stringify(DEMO_SEED_MANIFEST),
  ) as DemoSeedManifest;
  const replacePlaceholders = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value
        .replace(/PENDING APPROVAL[^<"]*/gi, 'Approved demo content')
        .replace(/demo content placeholder/gi, 'Approved demo content');
    }
    if (Array.isArray(value)) return value.map(replacePlaceholders);
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          replacePlaceholders(item),
        ]),
      );
    }
    return value;
  };
  const content = replacePlaceholders(manifest) as DemoSeedManifest;
  for (const approval of Object.values(manifest.approvals)) {
    approval.approved = true;
  }
  return { ...content, approvals: manifest.approvals };
}

export function manifestWithPending(
  keys: ApprovalKey[],
): DemoSeedManifest {
  const manifest = approvedManifest();
  for (const key of keys) {
    manifest.approvals[key].approved = false;
  }
  return manifest;
}

export function options(
  overrides: Partial<DemoSeedOptions> = {},
): DemoSeedOptions {
  return {
    nodeEnv: 'development',
    operationId: 'test-operation',
    mediaReconciliationAckIds: [],
    confirm: true,
    publishConfirm: true,
    expectedFingerprint: HISTORICAL_IDENTITY.fingerprint,
    publicApiBaseUrl: 'https://shop.example.com/api/v1',
    assetsDir: '/tmp/homepage-demo-assets',
    backupDir: '/tmp/homepage-demo-backups',
    replaceDraft: true,
    publish: true,
    acknowledgePublicationReplacement: true,
    ...overrides,
  };
}

export function planInput(
  manifest: DemoSeedManifest = approvedManifest(),
  overrides: Partial<DemoSeedPlanInput> = {},
): DemoSeedPlanInput {
  const assetMap = Object.fromEntries(
    manifest.media.map((asset, index) => [
      asset.key,
      {
        path: `/tmp/homepage-demo-assets/${asset.fileName}`,
        exists: index < manifest.media.length,
        sizeBytes: 100,
        sha256: 'a'.repeat(64),
        error: null,
      },
    ]),
  );
  return {
    generatedAt: '2026-11-15T00:00:00.000Z',
    identity: HISTORICAL_IDENTITY,
    manifest,
    options: options(),
    baseline: baseline(),
    campaigns: [],
    blogPosts: [],
    media: [],
    publishedMedia: [],
    ss245Post: {
      id: uuid(5000),
      slug: 'azmvn-ss-245-rahnmay-khryd-mavs-gymyng',
      status: 'PUBLISHED',
      createdBy: 'operator',
      updatedBy: null,
      publishedAt: '2026-11-10T01:01:28.842Z',
    },
    candidates: candidates(),
    assets: assetMap,
    ...overrides,
  };
}

export function campaignRow(
  internalName: string,
  overrides: Partial<DemoCampaignRow> = {},
): DemoCampaignRow {
  return {
    id: uuid(6000),
    internalName,
    createdBy: DEMO_ACTOR,
    updatedBy: null,
    ...overrides,
  };
}

export function blogRow(
  slug: string,
  overrides: Partial<DemoBlogRow> = {},
): DemoBlogRow {
  return {
    id: uuid(7000),
    slug,
    status: 'PUBLISHED',
    createdBy: DEMO_ACTOR,
    updatedBy: null,
    publishedAt: '2026-11-15T00:00:00.000Z',
    ...overrides,
  };
}

export function mediaRow(
  manifest: DemoSeedManifest,
  key: string,
  overrides: Partial<DemoMediaRow> = {},
): DemoMediaRow {
  const asset = manifest.media.find((item) => item.key === key);
  if (!asset) throw new Error(`Unknown asset ${key}`);
  return {
    id: uuid(8000),
    originalName: expectedMediaOriginalName(asset),
    createdBy: DEMO_ACTOR,
    publishedAt: null,
    deletedAt: null,
    sourceSha256: 'a'.repeat(64),
    processedSha256: 'b'.repeat(64),
    thumbnailSha256: 'c'.repeat(64),
    ...overrides,
  };
}

export function fakeWriter(
  calls: string[],
): DemoSeedWriteGateway {
  let index = 0;
  return {
    async upsertCampaign(definitionKey) {
      calls.push(`campaign:${definitionKey}`);
      index += 1;
      return { id: uuid(9000 + index), action: 'create' };
    },
    async mediaStorageIdentity(definitionKey) {
      return {
        action: 'create',
        storageKey: `merchandising/demo/test/${definitionKey}.jpg`,
        thumbnailKey: `merchandising/demo/test/${definitionKey}.thumb.webp`,
      };
    },
    async uploadOrReuseMedia(definitionKey) {
      calls.push(`media:${definitionKey}`);
      index += 1;
      return {
        id: uuid(9100 + index),
        action: 'create',
        storageAction: 'written',
        storageKey: `merchandising/demo/test/${definitionKey}.jpg`,
        thumbnailKey: `merchandising/demo/test/${definitionKey}.thumb.webp`,
      };
    },
    async upsertBlogPost(definitionKey) {
      calls.push(`blog:${definitionKey}`);
      index += 1;
      return { id: uuid(9200 + index), action: 'create' };
    },
    async applyDraftAndPublication() {
      calls.push('draft');
      return {
        revision: 4,
        publicationId: uuid(9300),
        publicationVersion: 4,
        supersededVersions: [3],
      };
    },
  };
}
