import {
  HOMEPAGE_MAX_SECTIONS,
  HOMEPAGE_SECTION_TYPES,
  MERCH_BLOG_FEATURE_MAX_POSTS,
  MERCH_BRAND_SHOWCASE_MAX_BRANDS,
  MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND,
  MERCH_CAMPAIGN_MAX_BRANDS,
  MERCH_CAMPAIGN_MAX_CATEGORIES,
  MERCH_CAMPAIGN_MAX_MEDIA,
  MERCH_CAMPAIGN_MAX_PRODUCTS,
  MERCH_CAMPAIGN_TYPES,
  MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES,
  MERCH_HERO_MAX_SLIDES,
  MERCH_HOMEPAGE_SCHEMA_VERSION,
  MERCH_MEDIA_SLOTS,
  MERCH_PRODUCT_RAIL_MAX_PRODUCTS,
  MERCH_READY_TO_SHIP_MAX_PRODUCTS,
  type HomepageSectionType,
} from '@sabz/types';
import { validateCampaignCta, validateCampaignWindow } from './campaign-validation';
import { validateTrustItems } from './homepage-section-validation';
import {
  addIssue,
  createValidationResult,
  isSafeInternalHref,
  isUuid,
  nullableString,
  optionalString,
  reportUnknownKeys,
  requireArray,
  requireInteger,
  requireRecord,
  requireString,
  requireUuid,
  requireUuidArray,
  type MerchValidationIssue,
  type MerchValidationResult,
  validateIsoDate,
} from './validation';

const SECTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const SECTION_TYPE_SET = new Set<string>(HOMEPAGE_SECTION_TYPES);
const CAMPAIGN_TYPE_SET = new Set<string>(MERCH_CAMPAIGN_TYPES);
const MEDIA_SLOT_SET = new Set<string>(MERCH_MEDIA_SLOTS);
const OFFER_FALLBACKS = ['featured', 'hide'] as const;
const RAIL_SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const;

const CAMPAIGN_SNAPSHOT_KEYS = [
  'sourceCampaignId',
  'type',
  'titleFa',
  'eyebrowFa',
  'subtitleFa',
  'descriptionFa',
  'ctaLabelFa',
  'cta',
  'productIds',
  'categoryIds',
  'brandIds',
  'media',
  'startsAt',
  'endsAt',
] as const;

/**
 * Validate an immutable published homepage snapshot. This checks the frozen
 * campaign presentation shape, section ordering/keys, limits, media slots, and
 * snapshot schema version without consulting the database.
 */
export function validateHomepageSnapshot(input: unknown): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const snapshot = requireRecord(input, 'snapshot', errors);
  if (!snapshot) {
    return createValidationResult(errors);
  }
  reportUnknownKeys(snapshot, ['schemaVersion', 'sections'], 'snapshot', errors);
  if (snapshot.schemaVersion !== MERCH_HOMEPAGE_SCHEMA_VERSION) {
    addIssue(
      errors,
      'snapshot.schemaVersion',
      'UNSUPPORTED_SCHEMA_VERSION',
      `نسخه ساختار باید ${MERCH_HOMEPAGE_SCHEMA_VERSION} باشد.`,
    );
  }
  const sections = snapshot.sections;
  if (!Array.isArray(sections)) {
    addIssue(errors, 'snapshot.sections', 'INVALID_ARRAY', 'فهرست بخش‌ها باید آرایه باشد.');
    return createValidationResult(errors);
  }
  if (sections.length > HOMEPAGE_MAX_SECTIONS) {
    addIssue(
      errors,
      'snapshot.sections',
      'SECTION_LIMIT',
      `حداکثر ${HOMEPAGE_MAX_SECTIONS} بخش مجاز است.`,
    );
  }

  const keys = new Set<string>();
  sections.forEach((rawSection, index) => {
    const path = `snapshot.sections[${index}]`;
    const section = requireRecord(rawSection, path, errors);
    if (!section) {
      return;
    }
    reportUnknownKeys(
      section,
      ['key', 'type', 'order', 'isVisible', 'settings'],
      path,
      errors,
    );
    if (
      typeof section.key !== 'string' ||
      !SECTION_KEY_PATTERN.test(section.key) ||
      keys.has(section.key)
    ) {
      addIssue(
        errors,
        `${path}.key`,
        'INVALID_SECTION_KEY',
        'کلید بخش باید یکتا و ۱ تا ۶۴ کاراکتر معتبر باشد.',
      );
    } else {
      keys.add(section.key);
    }
    if (section.order !== index) {
      addIssue(
        errors,
        `${path}.order`,
        'NON_NORMALIZED_ORDER',
        'ترتیب بخش‌ها باید پیوسته و برابر با موقعیت آرایه باشد.',
      );
    }
    if (typeof section.isVisible !== 'boolean') {
      addIssue(errors, `${path}.isVisible`, 'INVALID_BOOLEAN', 'isVisible باید بولی باشد.');
    }
    const type = section.type;
    if (typeof type !== 'string' || !SECTION_TYPE_SET.has(type)) {
      addIssue(
        errors,
        `${path}.type`,
        'UNKNOWN_SECTION_TYPE',
        'نوع بخش پشتیبانی نمی‌شود.',
      );
      return;
    }
    const settings = requireRecord(section.settings, `${path}.settings`, errors);
    if (!settings) {
      return;
    }
    validateSnapshotSettings(type as HomepageSectionType, settings, `${path}.settings`, errors);
  });

  return createValidationResult(errors);
}

/** Validate one campaign presentation snapshot embedded in a publication. */
export function validateCampaignSnapshot(
  input: unknown,
  path = 'campaign',
): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  const campaign = requireRecord(input, path, errors);
  if (!campaign) {
    return createValidationResult(errors);
  }
  reportUnknownKeys(campaign, CAMPAIGN_SNAPSHOT_KEYS, path, errors);
  requireUuid(campaign, 'sourceCampaignId', path, errors);
  const type = campaign.type;
  if (typeof type !== 'string' || !CAMPAIGN_TYPE_SET.has(type)) {
    addIssue(errors, `${path}.type`, 'INVALID_CAMPAIGN_TYPE', 'نوع کمپین معتبر نیست.');
  }
  requireString(campaign, 'titleFa', path, errors, 200);
  nullableString(campaign, 'eyebrowFa', path, errors, 120);
  nullableString(campaign, 'subtitleFa', path, errors, 300);
  nullableString(campaign, 'descriptionFa', path, errors, 1000);
  nullableString(campaign, 'ctaLabelFa', path, errors, 120);
  if (!('cta' in campaign)) {
    addIssue(errors, `${path}.cta`, 'MISSING_FIELD', 'مقصد فراخوانی الزامی است.');
  } else {
    errors.push(
      ...validateCampaignCta(campaign.cta).errors.map((error) => ({
        ...error,
        path: `${path}.${error.path}`,
      })),
    );
  }
  requireUuidArray(
    campaign,
    'productIds',
    path,
    errors,
    0,
    MERCH_CAMPAIGN_MAX_PRODUCTS,
  );
  requireUuidArray(
    campaign,
    'categoryIds',
    path,
    errors,
    0,
    MERCH_CAMPAIGN_MAX_CATEGORIES,
  );
  requireUuidArray(
    campaign,
    'brandIds',
    path,
    errors,
    0,
    MERCH_CAMPAIGN_MAX_BRANDS,
  );
  validateCampaignMediaSnapshots(campaign, path, errors);

  const start = requireNullableIso(campaign, 'startsAt', path, errors);
  const end = requireNullableIso(campaign, 'endsAt', path, errors);
  if (start && end) {
    errors.push(...validateCampaignWindow(start, end).errors);
  }
  return createValidationResult(errors);
}

function requireNullableIso(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): string | null {
  if (!(key in record)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'MISSING_FIELD',
      `«${key}» الزامی است (می‌تواند null باشد).`,
    );
    return null;
  }
  return validateIsoDate(record[key], `${path}.${key}`, errors, true);
}

function validateSnapshotSettings(
  type: HomepageSectionType,
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  switch (type) {
    case 'HERO_CAROUSEL':
      reportUnknownKeys(settings, ['campaigns'], path, errors);
      validateCampaignArray(settings, 'campaigns', path, errors, 1, MERCH_HERO_MAX_SLIDES);
      return;
    case 'TRUST_STRIP':
      reportUnknownKeys(settings, ['items'], path, errors);
      validateTrustItems(settings, path, errors);
      return;
    case 'CATEGORY_DISCOVERY': {
      reportUnknownKeys(settings, ['campaign'], path, errors);
      const campaign = validateSingleCampaign(settings, path, errors);
      if (campaign) {
        requireUuidArray(
          campaign,
          'categoryIds',
          `${path}.campaign`,
          errors,
          1,
          MERCH_CATEGORY_DISCOVERY_MAX_CATEGORIES,
        );
      }
      return;
    }
    case 'OFFER_STRIP': {
      reportUnknownKeys(settings, ['campaign', 'fallback'], path, errors);
      validateSingleCampaign(settings, path, errors);
      requireEnum(settings, 'fallback', OFFER_FALLBACKS, path, errors);
      return;
    }
    case 'CATEGORY_SPOTLIGHT': {
      reportUnknownKeys(
        settings,
        ['campaign', 'categoryId', 'secondaryCategoryId'],
        path,
        errors,
      );
      const campaign = validateSingleCampaign(settings, path, errors);
      const categoryId = requireUuid(settings, 'categoryId', path, errors);
      const secondary = optionalNullableUuid(settings, 'secondaryCategoryId', path, errors);
      if (categoryId && secondary === categoryId) {
        addIssue(
          errors,
          `${path}.secondaryCategoryId`,
          'DUPLICATE_CATEGORY',
          'دسته‌بندی ثانویه باید متفاوت باشد.',
        );
      }
      if (campaign && categoryId) {
        const ids = new Set(
          Array.isArray(campaign.categoryIds)
            ? campaign.categoryIds.filter((value): value is string => typeof value === 'string')
            : [],
        );
        if (!ids.has(categoryId)) {
          addIssue(
            errors,
            `${path}.categoryId`,
            'MISSING_CAMPAIGN_CATEGORY',
            'دسته‌بندی اصلی باید در انتخاب‌های کمپین باشد.',
          );
        }
      }
      return;
    }
    case 'READY_TO_SHIP':
      reportUnknownKeys(settings, ['limit', 'title', 'subtitle'], path, errors);
      requireInteger(settings, 'limit', path, errors, 1, MERCH_READY_TO_SHIP_MAX_PRODUCTS);
      optionalString(settings, 'title', path, errors, 120);
      optionalString(settings, 'subtitle', path, errors, 240);
      return;
    case 'PRODUCT_RAIL':
      reportUnknownKeys(settings, ['title', 'subtitle', 'actionHref', 'source'], path, errors);
      requireString(settings, 'title', path, errors, 120);
      optionalString(settings, 'subtitle', path, errors, 240);
      if ('actionHref' in settings && !isSafeInternalHref(settings.actionHref)) {
        addIssue(errors, `${path}.actionHref`, 'INVALID_HREF', 'مقصد داخلی معتبر نیست.');
      }
      validateProductRailSnapshotSource(settings.source, `${path}.source`, errors);
      return;
    case 'BRAND_SHOWCASE': {
      reportUnknownKeys(settings, ['campaign', 'productsPerBrand'], path, errors);
      const campaign = validateSingleCampaign(settings, path, errors);
      requireInteger(
        settings,
        'productsPerBrand',
        path,
        errors,
        1,
        MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND,
      );
      if (campaign) {
        requireUuidArray(
          campaign,
          'brandIds',
          `${path}.campaign`,
          errors,
          1,
          MERCH_BRAND_SHOWCASE_MAX_BRANDS,
        );
      }
      return;
    }
    case 'BLOG_FEATURE':
      validateBlogSnapshotSettings(settings, path, errors);
      return;
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

function validateCampaignArray(
  settings: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
  min: number,
  max: number,
): void {
  const values = requireArray(settings, key, path, errors, min, max);
  if (!values) {
    return;
  }
  values.forEach((value, index) => {
    errors.push(
      ...validateCampaignSnapshot(value, `${path}.${key}[${index}]`).errors,
    );
  });
}

function validateSingleCampaign(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): Record<string, unknown> | null {
  const campaign = requireRecord(settings.campaign, `${path}.campaign`, errors);
  if (!campaign) {
    return null;
  }
  errors.push(...validateCampaignSnapshot(campaign, `${path}.campaign`).errors);
  return campaign;
}

function validateCampaignMediaSnapshots(
  campaign: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  const media = requireArray(
    campaign,
    'media',
    path,
    errors,
    0,
    MERCH_CAMPAIGN_MAX_MEDIA,
  );
  if (!media) {
    return;
  }
  const seen = new Set<string>();
  media.forEach((raw, index) => {
    const mediaPath = `${path}.media[${index}]`;
    const item = requireRecord(raw, mediaPath, errors);
    if (!item) {
      return;
    }
    reportUnknownKeys(
      item,
      ['mediaId', 'slot', 'altFa', 'focalX', 'focalY', 'sortOrder'],
      mediaPath,
      errors,
    );
    const mediaId = requireUuid(item, 'mediaId', mediaPath, errors);
    const slot = item.slot;
    if (typeof slot !== 'string' || !MEDIA_SLOT_SET.has(slot)) {
      addIssue(errors, `${mediaPath}.slot`, 'INVALID_MEDIA_SLOT', 'جایگاه رسانه معتبر نیست.');
    } else if (mediaId) {
      const key = `${mediaId}:${slot}`;
      if (seen.has(key)) {
        addIssue(errors, `${mediaPath}.slot`, 'DUPLICATE_MEDIA_SLOT', 'رسانه تکراری است.');
      }
      seen.add(key);
    }
    nullableString(item, 'altFa', mediaPath, errors, 160);
    requireInteger(item, 'focalX', mediaPath, errors, 0, 100);
    requireInteger(item, 'focalY', mediaPath, errors, 0, 100);
    requireInteger(item, 'sortOrder', mediaPath, errors, 0, 1_000_000);
  });
}

function validateProductRailSnapshotSource(
  sourceRaw: unknown,
  path: string,
  errors: MerchValidationIssue[],
): void {
  const source = requireRecord(sourceRaw, path, errors);
  if (!source) {
    return;
  }
  if (source.kind === 'campaign') {
    reportUnknownKeys(source, ['kind', 'campaign'], path, errors);
    const campaign = requireRecord(source.campaign, `${path}.campaign`, errors);
    if (campaign) {
      errors.push(...validateCampaignSnapshot(campaign, `${path}.campaign`).errors);
    }
    return;
  }
  if (source.kind === 'query') {
    reportUnknownKeys(
      source,
      ['kind', 'categoryId', 'brandId', 'sort', 'limit', 'inStockOnly'],
      path,
      errors,
    );
    optionalNullableUuid(source, 'categoryId', path, errors);
    optionalNullableUuid(source, 'brandId', path, errors);
    if ('sort' in source && source.sort !== null) {
      requireEnum(source, 'sort', RAIL_SORTS, path, errors);
    }
    requireInteger(source, 'limit', path, errors, 1, MERCH_PRODUCT_RAIL_MAX_PRODUCTS);
    if ('inStockOnly' in source && typeof source.inStockOnly !== 'boolean') {
      addIssue(errors, `${path}.inStockOnly`, 'INVALID_BOOLEAN', 'inStockOnly باید بولی باشد.');
    }
    return;
  }
  addIssue(errors, `${path}.kind`, 'INVALID_RAIL_SOURCE', 'منبع ریل معتبر نیست.');
}

function validateBlogSnapshotSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  if (settings.source === 'manual') {
    reportUnknownKeys(settings, ['source', 'postIds'], path, errors);
    requireUuidArray(settings, 'postIds', path, errors, 1, MERCH_BLOG_FEATURE_MAX_POSTS);
    return;
  }
  if (settings.source === 'latest') {
    reportUnknownKeys(settings, ['source', 'limit'], path, errors);
    requireInteger(settings, 'limit', path, errors, 1, MERCH_BLOG_FEATURE_MAX_POSTS);
    return;
  }
  addIssue(errors, `${path}.source`, 'INVALID_BLOG_SOURCE', 'منبع بخش وبلاگ معتبر نیست.');
}

function optionalNullableUuid(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: MerchValidationIssue[],
): string | null {
  if (!(key in record) || record[key] === null) {
    return null;
  }
  const value = record[key];
  if (!isUuid(value)) {
    addIssue(errors, `${path}.${key}`, 'INVALID_UUID', 'شناسه معتبر نیست.');
    return null;
  }
  return value;
}

function requireEnum<T extends readonly string[]>(
  record: Record<string, unknown>,
  key: string,
  values: T,
  path: string,
  errors: MerchValidationIssue[],
): string | null {
  const value = record[key];
  if (typeof value !== 'string' || !values.includes(value)) {
    addIssue(
      errors,
      `${path}.${key}`,
      'INVALID_ENUM',
      `«${key}» باید یکی از مقادیر مجاز باشد.`,
    );
    return null;
  }
  return value;
}
