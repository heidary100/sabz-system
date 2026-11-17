import {
  validateCampaignCta,
  validateCampaignSchedule,
  validateCampaignSelectionLimits,
  validateCampaignWindow,
} from './campaign-validation';
import {
  HOMEPAGE_SECTION_REGISTRY,
  validateHomepageDraftSections,
} from './homepage-section-validation';
import { validateHomepageSnapshot } from './homepage-snapshot-validation';

const ID1 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
const ID2 = '7d444840-9dc0-11d1-b245-5ffdce74fad2';
const ID3 = 'a8098c1a-f86e-11da-bd1a-00112444be1e';
const ID4 = '6fa459ea-ee8a-3ca4-894e-db77e160355e';

function section(type: string, settings: unknown, overrides: Record<string, unknown> = {}) {
  return {
    key: `section-${type.toLowerCase()}`,
    type,
    order: 0,
    isVisible: true,
    settings,
    ...overrides,
  };
}

function validSections() {
  return [
    section('HERO_CAROUSEL', { campaignIds: [ID1] }),
    section('TRUST_STRIP', {
      items: [{ icon: 'shield', title: 'تضمین کیفیت' }],
    }),
    section('CATEGORY_DISCOVERY', { campaignId: ID1 }),
    section('OFFER_STRIP', { campaignId: ID1, fallback: 'featured' }),
    section('CATEGORY_SPOTLIGHT', {
      campaignId: ID1,
      categoryId: ID2,
      secondaryCategoryId: null,
    }),
    section('READY_TO_SHIP', { limit: 4, title: 'آماده ارسال' }),
    section('PRODUCT_RAIL', {
      title: 'تازه‌ها',
      source: { kind: 'query', limit: 6 },
    }),
    section('BRAND_SHOWCASE', { campaignId: ID1, productsPerBrand: 4 }),
    section('BLOG_FEATURE', { source: 'latest', limit: 3 }),
  ].map((item, index) => ({ ...item, key: `section-${index}`, order: index }));
}

function campaignSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    sourceCampaignId: ID1,
    type: 'EDITORIAL',
    titleFa: 'کمپین نمونه',
    eyebrowFa: null,
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    cta: { kind: 'NONE' },
    productIds: [],
    categoryIds: [ID2],
    brandIds: [],
    media: [],
    startsAt: null,
    endsAt: null,
    ...overrides,
  };
}

function validSnapshot() {
  return {
    schemaVersion: 1,
    sections: [
      {
        key: 'hero',
        type: 'HERO_CAROUSEL',
        order: 0,
        isVisible: true,
        settings: { campaigns: [campaignSnapshot()] },
      },
      {
        key: 'categories',
        type: 'CATEGORY_DISCOVERY',
        order: 1,
        isVisible: true,
        settings: {
          campaign: campaignSnapshot({ categoryIds: [ID2] }),
        },
      },
    ],
  };
}

describe('homepage draft section validation', () => {
  it('recognizes every supported section type', () => {
    expect(Object.keys(HOMEPAGE_SECTION_REGISTRY).sort()).toEqual([
      'BLOG_FEATURE',
      'BRAND_SHOWCASE',
      'CATEGORY_DISCOVERY',
      'CATEGORY_SPOTLIGHT',
      'HERO_CAROUSEL',
      'OFFER_STRIP',
      'PRODUCT_RAIL',
      'READY_TO_SHIP',
      'TRUST_STRIP',
    ]);
    const result = validateHomepageDraftSections(validSections());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects an unknown section type and unknown top-level fields', () => {
    const result = validateHomepageDraftSections([
      section('UNKNOWN', {}, { extra: true }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_SECTION_TYPE')).toBe(true);
    expect(result.errors.some((e) => e.code === 'UNKNOWN_FIELD')).toBe(true);
  });

  it('rejects non-normalized and duplicate section keys/order', () => {
    const sections = validSections();
    sections[0] = { ...sections[0]!, order: 2 };
    sections[1] = { ...sections[1]!, key: sections[0]!.key };
    const result = validateHomepageDraftSections(sections);
    expect(result.errors.some((e) => e.code === 'NON_NORMALIZED_ORDER')).toBe(true);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_SECTION_KEY')).toBe(true);
  });

  it('rejects invalid section keys', () => {
    const result = validateHomepageDraftSections([
      section('READY_TO_SHIP', { limit: 4 }, { key: 'bad key!' }),
    ]);
    expect(result.errors.some((e) => e.code === 'INVALID_SECTION_KEY')).toBe(true);
  });

  it('enforces hero, trust, ready and rail limits', () => {
    const result = validateHomepageDraftSections([
      section('HERO_CAROUSEL', { campaignIds: [ID1, ID2, ID3, ID4] }),
      section('TRUST_STRIP', {
        items: Array.from({ length: 5 }, () => ({ icon: 'shield', title: 'x' })),
      }),
      section('READY_TO_SHIP', { limit: 0 }),
      section('PRODUCT_RAIL', {
        title: 'rail',
        source: { kind: 'query', limit: 13 },
      }),
    ].map((item, index) => ({ ...item, key: `limit-${index}`, order: index })));
    expect(result.errors.some((e) => e.code === 'INVALID_ARRAY')).toBe(true);
    expect(result.errors.some((e) => e.code === 'INVALID_INTEGER')).toBe(true);
  });

  it('rejects unknown settings fields and invalid nested values', () => {
    const result = validateHomepageDraftSections([
      section('OFFER_STRIP', {
        campaignId: ID1,
        fallback: 'featured',
        extra: true,
      }),
      section('PRODUCT_RAIL', {
        title: 'rail',
        source: { kind: 'query', limit: 6, unsupported: true },
      }),
      section('BLOG_FEATURE', { source: 'manual', postIds: [] }),
    ].map((item, index) => ({ ...item, key: `nested-${index}`, order: index })));
    expect(result.errors.filter((e) => e.code === 'UNKNOWN_FIELD').length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.code === 'INVALID_ARRAY')).toBe(true);
  });

  it('does not coerce invalid ordering or section settings', () => {
    const result = validateHomepageDraftSections([
      section('READY_TO_SHIP', { limit: '4' }, { order: 0 }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_INTEGER')).toBe(true);
  });
});

describe('campaign foundation validation', () => {
  it('validates campaign windows in UTC-compatible ISO form', () => {
    expect(
      validateCampaignWindow('2026-11-10T00:00:00.000Z', '2026-11-11T00:00:00.000Z').valid,
    ).toBe(true);
    expect(
      validateCampaignWindow('2026-11-11T00:00:00.000Z', '2026-11-10T00:00:00.000Z').errors.some(
        (e) => e.code === 'INVALID_WINDOW',
      ),
    ).toBe(true);
    expect(validateCampaignWindow('not-a-date', null).valid).toBe(false);
  });

  it('enforces selection limits and duplicate IDs', () => {
    const result = validateCampaignSelectionLimits({
      productIds: Array.from({ length: 13 }, (_, i) => (i === 0 ? ID1 : ID1)),
      categoryIds: [ID1, ID2, ID3, ID4, ID1, ID2, ID3],
      brandIds: [ID1, ID2, ID3, ID4, ID1, ID2],
      media: Array.from({ length: 5 }, () => ({ mediaId: ID1, slot: 'BANNER' })),
    });
    expect(result.errors.some((e) => e.code === 'SELECTION_LIMIT')).toBe(true);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ID')).toBe(true);
    expect(result.errors.some((e) => e.code === 'MEDIA_LIMIT')).toBe(true);
  });

  it('validates typed CTA targets and rejects mixed targets', () => {
    expect(validateCampaignCta({ kind: 'PRODUCT', productId: ID1 }).valid).toBe(true);
    expect(validateCampaignCta({ kind: 'NONE', productId: ID1 }).valid).toBe(false);
    expect(validateCampaignCta({ kind: 'CATEGORY' }).valid).toBe(false);
    expect(validateCampaignCta({ kind: 'BOGUS' }).valid).toBe(false);
  });

  it('validates schedule fields and rejects unknown properties', () => {
    expect(
      validateCampaignSchedule({
        startsAt: '2026-11-10T00:00:00.000Z',
        endsAt: '2026-11-11T00:00:00.000Z',
        isEnabled: true,
        priority: 2,
      }).valid,
    ).toBe(true);
    expect(validateCampaignSchedule({ extra: true }).valid).toBe(false);
  });
});

describe('homepage snapshot validation', () => {
  it('accepts a valid immutable snapshot', () => {
    const result = validateHomepageSnapshot(validSnapshot());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects unsupported schema versions, ordering and duplicate keys', () => {
    const snapshot = validSnapshot();
    snapshot.schemaVersion = 2;
    snapshot.sections[1] = {
      ...snapshot.sections[1]!,
      key: 'hero',
      order: 5,
    };
    const result = validateHomepageSnapshot(snapshot);
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION')).toBe(true);
    expect(result.errors.some((e) => e.code === 'INVALID_SECTION_KEY')).toBe(true);
    expect(result.errors.some((e) => e.code === 'NON_NORMALIZED_ORDER')).toBe(true);
  });

  it('rejects invalid campaign snapshots, CTA and media focal ranges', () => {
    const snapshot = validSnapshot();
    snapshot.sections[0] = {
      ...snapshot.sections[0]!,
      settings: {
        campaigns: [
          campaignSnapshot({
            cta: { kind: 'PRODUCT' },
            media: [
              {
                mediaId: ID1,
                slot: 'HERO_DESKTOP',
                altFa: null,
                focalX: 101,
                focalY: -1,
                sortOrder: 0,
              },
            ],
          }),
        ],
      },
    };
    const result = validateHomepageSnapshot(snapshot);
    expect(result.errors.some((e) => e.code === 'INVALID_INTEGER')).toBe(true);
    expect(result.errors.some((e) => e.code === 'INVALID_UUID')).toBe(true);
  });
});
