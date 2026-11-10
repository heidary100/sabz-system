import {
  HOMEPAGE_MAX_SECTIONS,
  HOMEPAGE_SECTION_TYPES,
  MERCH_BLOG_FEATURE_MAX_POSTS,
  MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND,
  MERCH_HERO_MAX_SLIDES,
  MERCH_PRODUCT_RAIL_MAX_PRODUCTS,
  MERCH_READY_TO_SHIP_MAX_PRODUCTS,
  MERCH_TRUST_ICONS,
  MERCH_TRUST_STRIP_MAX_ITEMS,
  type HomepageSectionType,
} from '@sabz/types';
import {
  addIssue,
  createValidationResult,
  isSafeInternalHref,
  optionalBoolean,
  optionalString,
  optionalUuid,
  reportUnknownKeys,
  requireArray,
  requireBoolean,
  requireInteger,
  requireRecord,
  requireString,
  requireUuid,
  requireUuidArray,
  type MerchValidationIssue,
  type MerchValidationResult,
} from './validation';

const SECTION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const PRODUCT_RAIL_SORTS = ['newest', 'price_asc', 'price_desc', 'name'] as const;
const OFFER_FALLBACKS = ['featured', 'hide'] as const;

const TOP_LEVEL_KEYS = ['key', 'type', 'order', 'isVisible', 'settings'] as const;
const TRUST_ICON_SET = new Set<string>(MERCH_TRUST_ICONS);
const SECTION_TYPE_SET = new Set<string>(HOMEPAGE_SECTION_TYPES);

export function validateHomepageDraftSections(input: unknown): MerchValidationResult {
  const errors: MerchValidationIssue[] = [];
  if (!Array.isArray(input)) {
    addIssue(errors, 'sections', 'INVALID_ARRAY', 'فهرست بخش‌ها باید آرایه باشد.');
    return createValidationResult(errors);
  }
  if (input.length > HOMEPAGE_MAX_SECTIONS) {
    addIssue(
      errors,
      'sections',
      'SECTION_LIMIT',
      `حداکثر ${HOMEPAGE_MAX_SECTIONS} بخش برای صفحه اصلی مجاز است.`,
    );
  }

  const keys = new Set<string>();
  input.forEach((rawSection, index) => {
    const path = `sections[${index}]`;
    const section = requireRecord(rawSection, path, errors);
    if (!section) {
      return;
    }
    reportUnknownKeys(section, TOP_LEVEL_KEYS, path, errors);

    const key = section.key;
    if (
      typeof key !== 'string' ||
      !SECTION_KEY_PATTERN.test(key)
    ) {
      addIssue(
        errors,
        `${path}.key`,
        'INVALID_SECTION_KEY',
        'کلید بخش باید ۱ تا ۶۴ کاراکتر انگلیسی، عدد، خط تیره یا زیرخط باشد.',
      );
    } else if (keys.has(key)) {
      addIssue(
        errors,
        `${path}.key`,
        'DUPLICATE_SECTION_KEY',
        'کلید بخش باید یکتا باشد.',
      );
    } else {
      keys.add(key);
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

    if (section.order !== index) {
      addIssue(
        errors,
        `${path}.order`,
        'NON_NORMALIZED_ORDER',
        'ترتیب بخش‌ها باید پیوسته و برابر با موقعیت آرایه باشد.',
      );
    }
    requireBoolean(section, 'isVisible', path, errors);

    const settings = requireRecord(section.settings, `${path}.settings`, errors);
    if (!settings) {
      return;
    }
    validateSettings(type as HomepageSectionType, settings, `${path}.settings`, errors);
  });

  return createValidationResult(errors);
}

export type HomepageSectionSettingsValidator = (
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
) => void;

/**
 * Explicit section registry. Adding a section type requires adding its settings
 * validator here and to the shared union; the publication lifecycle does not
 * change. This is intentionally not a generic widget registry.
 */
export const HOMEPAGE_SECTION_REGISTRY: Record<
  HomepageSectionType,
  HomepageSectionSettingsValidator
> = {
  HERO_CAROUSEL: validateHeroCarouselSettings,
  TRUST_STRIP: validateTrustStripSettings,
  CATEGORY_DISCOVERY: validateCategoryDiscoverySettings,
  OFFER_STRIP: validateOfferStripSettings,
  CATEGORY_SPOTLIGHT: validateCategorySpotlightSettings,
  READY_TO_SHIP: validateReadyToShipSettings,
  PRODUCT_RAIL: validateProductRailSettings,
  BRAND_SHOWCASE: validateBrandShowcaseSettings,
  BLOG_FEATURE: validateBlogFeatureSettings,
};

function validateSettings(
  type: HomepageSectionType,
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  HOMEPAGE_SECTION_REGISTRY[type](settings, path, errors);
}

function validateHeroCarouselSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['campaignIds'], path, errors);
  requireUuidArray(
    settings,
    'campaignIds',
    path,
    errors,
    1,
    MERCH_HERO_MAX_SLIDES,
  );
}

function validateTrustStripSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['items'], path, errors);
  validateTrustItems(settings, path, errors);
}

function validateCategoryDiscoverySettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['campaignId'], path, errors);
  requireUuid(settings, 'campaignId', path, errors);
}

function validateOfferStripSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['campaignId', 'fallback'], path, errors);
  requireUuid(settings, 'campaignId', path, errors);
  requireEnum(settings, 'fallback', OFFER_FALLBACKS, path, errors);
}

function validateCategorySpotlightSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(
    settings,
    ['campaignId', 'categoryId', 'secondaryCategoryId'],
    path,
    errors,
  );
  requireUuid(settings, 'campaignId', path, errors);
  const categoryId = requireUuid(settings, 'categoryId', path, errors);
  const secondary = optionalUuid(settings, 'secondaryCategoryId', path, errors);
  if (categoryId !== null && secondary === categoryId) {
    addIssue(
      errors,
      `${path}.secondaryCategoryId`,
      'DUPLICATE_CATEGORY',
      'دسته‌بندی ثانویه باید با دسته‌بندی اصلی متفاوت باشد.',
    );
  }
}

function validateReadyToShipSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['limit', 'title', 'subtitle'], path, errors);
  requireInteger(
    settings,
    'limit',
    path,
    errors,
    1,
    MERCH_READY_TO_SHIP_MAX_PRODUCTS,
  );
  optionalString(settings, 'title', path, errors, 120);
  optionalString(settings, 'subtitle', path, errors, 240);
}

function validateProductRailSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['title', 'subtitle', 'actionHref', 'source'], path, errors);
  requireString(settings, 'title', path, errors, 120);
  optionalString(settings, 'subtitle', path, errors, 240);
  validateActionHref(settings, path, errors);
  validateProductRailSource(settings.source, `${path}.source`, errors);
}

function validateBrandShowcaseSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  reportUnknownKeys(settings, ['campaignId', 'productsPerBrand'], path, errors);
  requireUuid(settings, 'campaignId', path, errors);
  requireInteger(
    settings,
    'productsPerBrand',
    path,
    errors,
    1,
    MERCH_BRAND_SHOWCASE_MAX_PRODUCTS_PER_BRAND,
  );
}

function validateBlogFeatureSettings(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  validateBlogFeature(settings, path, errors);
}

export function validateTrustItems(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  const items = requireArray(
    settings,
    'items',
    path,
    errors,
    0,
    MERCH_TRUST_STRIP_MAX_ITEMS,
  );
  if (!items) {
    return;
  }
  items.forEach((rawItem, index) => {
    const itemPath = `${path}.items[${index}]`;
    const item = requireRecord(rawItem, itemPath, errors);
    if (!item) {
      return;
    }
    reportUnknownKeys(item, ['icon', 'title', 'body'], itemPath, errors);
    const icon = item.icon;
    if (typeof icon !== 'string' || !TRUST_ICON_SET.has(icon)) {
      addIssue(
        errors,
        `${itemPath}.icon`,
        'INVALID_TRUST_ICON',
        'آیکن باید یکی از shield، truck، badge یا support باشد.',
      );
    }
    requireString(item, 'title', itemPath, errors, 120);
    optionalString(item, 'body', itemPath, errors, 240);
  });
}

function validateActionHref(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  if (!('actionHref' in settings)) {
    return;
  }
  const value = settings.actionHref;
  if (!isSafeInternalHref(value)) {
    addIssue(
      errors,
      `${path}.actionHref`,
      'INVALID_HREF',
      'مقصد باید یک مسیر داخلی معتبر از محصولات، دسته‌بندی‌ها یا وبلاگ باشد.',
    );
  }
}

function validateProductRailSource(
  sourceRaw: unknown,
  path: string,
  errors: MerchValidationIssue[],
): void {
  const source = requireRecord(sourceRaw, path, errors);
  if (!source) {
    return;
  }
  if (source.kind === 'campaign') {
    reportUnknownKeys(source, ['kind', 'campaignId'], path, errors);
    requireUuid(source, 'campaignId', path, errors);
    return;
  }
  if (source.kind === 'query') {
    reportUnknownKeys(
      source,
      ['kind', 'categoryId', 'brandId', 'sort', 'limit', 'inStockOnly'],
      path,
      errors,
    );
    if ('categoryId' in source) {
      optionalUuid(source, 'categoryId', path, errors);
    }
    if ('brandId' in source) {
      optionalUuid(source, 'brandId', path, errors);
    }
    if ('sort' in source) {
      requireEnum(source, 'sort', PRODUCT_RAIL_SORTS, path, errors);
    }
    requireInteger(source, 'limit', path, errors, 1, MERCH_PRODUCT_RAIL_MAX_PRODUCTS);
    optionalBoolean(source, 'inStockOnly', path, errors);
    return;
  }
  addIssue(
    errors,
    `${path}.kind`,
    'INVALID_RAIL_SOURCE',
    'منبع ریل باید campaign یا query باشد.',
  );
}

function validateBlogFeature(
  settings: Record<string, unknown>,
  path: string,
  errors: MerchValidationIssue[],
): void {
  if (settings.source === 'manual') {
    reportUnknownKeys(settings, ['source', 'postIds'], path, errors);
    requireUuidArray(
      settings,
      'postIds',
      path,
      errors,
      1,
      MERCH_BLOG_FEATURE_MAX_POSTS,
    );
    return;
  }
  if (settings.source === 'latest') {
    reportUnknownKeys(settings, ['source', 'limit'], path, errors);
    requireInteger(
      settings,
      'limit',
      path,
      errors,
      1,
      MERCH_BLOG_FEATURE_MAX_POSTS,
    );
    return;
  }
  addIssue(
    errors,
    `${path}.source`,
    'INVALID_BLOG_SOURCE',
    'منبع بخش وبلاگ باید latest یا manual باشد.',
  );
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
      `«${key}» باید یکی از مقادیر مجاز باشد: ${values.join(', ')}.`,
    );
    return null;
  }
  return value;
}
