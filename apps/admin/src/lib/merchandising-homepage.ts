import type {
  BlogFeatureSection,
  HomepageDraftSection,
  HomepageDraftValidationResult,
  HomepageSectionType,
  HomepageValidationIssue,
  ProductRailSection,
  ReadyToShipSection,
  TrustStripSection,
} from '@sabz/types'
import {
  HOMEPAGE_MAX_SECTIONS,
  HOMEPAGE_SECTION_TYPES,
} from '@sabz/types'

export const HOMEPAGE_SECTION_LABELS: Record<HomepageSectionType, string> = {
  HERO_CAROUSEL: 'کاروسل هدر',
  TRUST_STRIP: 'نوار اعتماد',
  CATEGORY_DISCOVERY: 'کشف دسته‌بندی',
  OFFER_STRIP: 'نوار پیشنهاد',
  CATEGORY_SPOTLIGHT: 'دسته‌بندی ویژه',
  READY_TO_SHIP: 'آماده ارسال',
  PRODUCT_RAIL: 'ریل محصولات',
  BRAND_SHOWCASE: 'ویترین برند',
  BLOG_FEATURE: 'ویژه وبلاگ',
}

export const HOMEPAGE_SECTION_DESCRIPTIONS: Record<
  HomepageSectionType,
  string
> = {
  HERO_CAROUSEL: 'اسلایدهای اصلی صفحه با کمپین‌های انتخابی.',
  TRUST_STRIP: 'نوار کوتاه مزیت‌ها و تضمین‌های فروشگاه.',
  CATEGORY_DISCOVERY: 'نمایش دسته‌بندی‌های یک کمپین.',
  OFFER_STRIP: 'پیشنهادهای محصولات یک کمپین با حالت جایگزین.',
  CATEGORY_SPOTLIGHT: 'تمرکز روی یک دسته‌بندی از کمپین.',
  READY_TO_SHIP: 'محصولات آماده ارسال با محدودیت تعداد.',
  PRODUCT_RAIL: 'فهرست محصولات بر اساس کمپین یا پرس‌وجوی کاتالوگ.',
  BRAND_SHOWCASE: 'گروه‌بندی محصولات بر اساس برندهای کمپین.',
  BLOG_FEATURE: 'آخرین مطالب وبلاگ یا مجموعه دستی.',
}

export const HOMEPAGE_SECTION_TYPE_ORDER: readonly HomepageSectionType[] =
  HOMEPAGE_SECTION_TYPES

export interface HomepageSectionTypeDefinition {
  type: HomepageSectionType
  label: string
  description: string
  canAdd: boolean
  requiresInitialCampaign?: boolean
  unavailableReason?: string
}

export const HOMEPAGE_PRODUCT_RAIL_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'name',
] as const

export const HOMEPAGE_PRODUCT_RAIL_SORT_LABELS: Record<
  (typeof HOMEPAGE_PRODUCT_RAIL_SORTS)[number],
  string
> = {
  newest: 'جدیدترین',
  price_asc: 'ارزان‌ترین',
  price_desc: 'گران‌ترین',
  name: 'الفبایی',
}

/** Mirrors the backend's safe internal href allowlist. */
export function isSafeHomepageActionHref(value: string): boolean {
  if (value.length === 0 || value.length > 500) {
    return false
  }
  if (!value.startsWith('/') || value.startsWith('//')) {
    return false
  }
  return /^\/(?:products|categories|blog)(?:[/?][A-Za-z0-9\-_[\]=&.%?/]*)?$/.test(
    value,
  )
}

/**
 * The nine supported types are all registered. Campaign-backed types use the
 * creation flow to select a real campaign (and any required category/brand
 * evidence) before insertion, so no invalid placeholder references are stored.
 */
export const HOMEPAGE_SECTION_REGISTRY: Record<
  HomepageSectionType,
  HomepageSectionTypeDefinition
> = {
  HERO_CAROUSEL: {
    type: 'HERO_CAROUSEL',
    label: HOMEPAGE_SECTION_LABELS.HERO_CAROUSEL,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.HERO_CAROUSEL,
    canAdd: true,
    requiresInitialCampaign: true,
  },
  TRUST_STRIP: {
    type: 'TRUST_STRIP',
    label: HOMEPAGE_SECTION_LABELS.TRUST_STRIP,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.TRUST_STRIP,
    canAdd: true,
  },
  CATEGORY_DISCOVERY: {
    type: 'CATEGORY_DISCOVERY',
    label: HOMEPAGE_SECTION_LABELS.CATEGORY_DISCOVERY,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.CATEGORY_DISCOVERY,
    canAdd: true,
    requiresInitialCampaign: true,
  },
  OFFER_STRIP: {
    type: 'OFFER_STRIP',
    label: HOMEPAGE_SECTION_LABELS.OFFER_STRIP,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.OFFER_STRIP,
    canAdd: true,
    requiresInitialCampaign: true,
  },
  CATEGORY_SPOTLIGHT: {
    type: 'CATEGORY_SPOTLIGHT',
    label: HOMEPAGE_SECTION_LABELS.CATEGORY_SPOTLIGHT,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.CATEGORY_SPOTLIGHT,
    canAdd: true,
    requiresInitialCampaign: true,
  },
  READY_TO_SHIP: {
    type: 'READY_TO_SHIP',
    label: HOMEPAGE_SECTION_LABELS.READY_TO_SHIP,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.READY_TO_SHIP,
    canAdd: true,
  },
  PRODUCT_RAIL: {
    type: 'PRODUCT_RAIL',
    label: HOMEPAGE_SECTION_LABELS.PRODUCT_RAIL,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.PRODUCT_RAIL,
    canAdd: true,
  },
  BRAND_SHOWCASE: {
    type: 'BRAND_SHOWCASE',
    label: HOMEPAGE_SECTION_LABELS.BRAND_SHOWCASE,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.BRAND_SHOWCASE,
    canAdd: true,
    requiresInitialCampaign: true,
  },
  BLOG_FEATURE: {
    type: 'BLOG_FEATURE',
    label: HOMEPAGE_SECTION_LABELS.BLOG_FEATURE,
    description: HOMEPAGE_SECTION_DESCRIPTIONS.BLOG_FEATURE,
    canAdd: true,
  },
}

export function sectionTypeLabel(type: HomepageSectionType): string {
  return HOMEPAGE_SECTION_LABELS[type] ?? String(type)
}

export function createDefaultSection(
  type: HomepageSectionType,
  key: string,
  order: number,
): HomepageDraftSection | null {
  const base = { key, order, isVisible: true }
  switch (type) {
    case 'TRUST_STRIP':
      return {
        ...base,
        type,
        settings: { items: [] },
      } satisfies TrustStripSection
    case 'READY_TO_SHIP':
      return {
        ...base,
        type,
        settings: { limit: 4 },
      } satisfies ReadyToShipSection
    case 'PRODUCT_RAIL':
      return {
        ...base,
        type,
        settings: {
          title: 'محصولات منتخب',
          source: {
            kind: 'query',
            categoryId: null,
            brandId: null,
            sort: 'newest',
            limit: 8,
            inStockOnly: false,
          },
        },
      } satisfies ProductRailSection
    case 'BLOG_FEATURE':
      return {
        ...base,
        type,
        settings: { source: 'latest', limit: 3 },
      } satisfies BlogFeatureSection
    default:
      return null
  }
}

export function generateSectionKey(
  type: HomepageSectionType,
  existingKeys: Iterable<string>,
  random: () => number = Math.random,
): string {
  const existing = new Set(existingKeys)
  const base = type.toLowerCase().replace(/_/g, '-').slice(0, 40)
  let attempt = 0
  while (attempt < 1000) {
    const suffix = random().toString(36).slice(2, 8).padEnd(6, '0')
    const candidate = attempt === 0 ? `${base}-${suffix}` : `${base}-${suffix}${attempt}`
    if (!existing.has(candidate) && candidate.length <= 64) {
      return candidate
    }
    attempt += 1
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 64)
}

export function normalizeSectionOrder(
  sections: HomepageDraftSection[],
): HomepageDraftSection[] {
  return sections.map((section, index) =>
    section.order === index ? section : { ...section, order: index },
  )
}

export function cloneSections(
  sections: HomepageDraftSection[],
): HomepageDraftSection[] {
  return JSON.parse(JSON.stringify(sections)) as HomepageDraftSection[]
}

export function sectionsEqual(
  left: HomepageDraftSection[],
  right: HomepageDraftSection[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function appendHomepageSection(
  sections: HomepageDraftSection[],
  type: HomepageSectionType,
  random?: () => number,
): { sections: HomepageDraftSection[]; index: number } | { error: string } {
  if (sections.length >= HOMEPAGE_MAX_SECTIONS) {
    return {
      error: `حداکثر ${HOMEPAGE_MAX_SECTIONS.toLocaleString('fa-IR')} بخش مجاز است.`,
    }
  }
  const definition = HOMEPAGE_SECTION_REGISTRY[type]
  if (!definition.canAdd) {
    return {
      error:
        definition.unavailableReason ??
        'این نوع بخش در گام فعلی قابل ایجاد نیست.',
    }
  }
  if (definition.requiresInitialCampaign) {
    return {
      error:
        'این نوع بخش باید با انتخاب اولیه کمپین از مسیر ایجاد بخش اضافه شود.',
    }
  }
  const key = generateSectionKey(
    type,
    sections.map((section) => section.key),
    random,
  )
  const section = createDefaultSection(type, key, sections.length)
  if (!section) {
    return { error: 'ساخت بخش جدید برای این نوع ممکن نیست.' }
  }
  const next = normalizeSectionOrder([...sections, section])
  return { sections: next, index: next.length - 1 }
}

/** Insert a section whose required initial references were selected first. */
export function appendHomepageSectionWithSettings(
  sections: HomepageDraftSection[],
  type: HomepageSectionType,
  settings: HomepageDraftSection['settings'],
  random?: () => number,
): { sections: HomepageDraftSection[]; index: number } | { error: string } {
  if (sections.length >= HOMEPAGE_MAX_SECTIONS) {
    return {
      error: `حداکثر ${HOMEPAGE_MAX_SECTIONS.toLocaleString('fa-IR')} بخش مجاز است.`,
    }
  }
  const definition = HOMEPAGE_SECTION_REGISTRY[type]
  if (!definition.canAdd) {
    return {
      error:
        definition.unavailableReason ??
        'این نوع بخش در گام فعلی قابل ایجاد نیست.',
    }
  }
  const key = generateSectionKey(
    type,
    sections.map((section) => section.key),
    random,
  )
  const section = {
    key,
    type,
    order: sections.length,
    isVisible: true,
    settings,
  } as HomepageDraftSection
  const next = normalizeSectionOrder([...sections, section])
  return { sections: next, index: next.length - 1 }
}

export function moveHomepageSection(
  sections: HomepageDraftSection[],
  index: number,
  direction: -1 | 1,
): HomepageDraftSection[] {
  const target = index + direction
  if (index < 0 || index >= sections.length || target < 0 || target >= sections.length) {
    return sections
  }
  const next = [...sections]
  const [section] = next.splice(index, 1)
  next.splice(target, 0, section!)
  return normalizeSectionOrder(next)
}

export function removeHomepageSection(
  sections: HomepageDraftSection[],
  index: number,
): HomepageDraftSection[] {
  if (index < 0 || index >= sections.length) {
    return sections
  }
  return normalizeSectionOrder(sections.filter((_, itemIndex) => itemIndex !== index))
}

export function toggleSectionVisibility(
  sections: HomepageDraftSection[],
  index: number,
): HomepageDraftSection[] {
  if (index < 0 || index >= sections.length) {
    return sections
  }
  return sections.map((section, itemIndex) =>
    itemIndex === index
      ? { ...section, isVisible: !section.isVisible }
      : section,
  )
}

const SECTION_PATH_PATTERN = /^sections\[(\d+)\](?:\.|$)/

export function sectionIndexFromValidationPath(path: string): number | null {
  const match = SECTION_PATH_PATTERN.exec(path)
  if (!match) {
    return null
  }
  const index = Number(match[1])
  return Number.isInteger(index) ? index : null
}

export interface ValidationIssueBucket {
  errors: HomepageValidationIssue[]
  warnings: HomepageValidationIssue[]
}

export interface GroupedHomepageValidation {
  bySection: Map<number, ValidationIssueBucket>
  unmapped: ValidationIssueBucket
  errorCount: number
  warningCount: number
}

export function groupHomepageValidation(
  result: HomepageDraftValidationResult,
  sectionCount: number,
): GroupedHomepageValidation {
  const bySection = new Map<number, ValidationIssueBucket>()
  const unmapped: ValidationIssueBucket = { errors: [], warnings: [] }

  const add = (
    issue: HomepageValidationIssue,
    severity: 'errors' | 'warnings',
  ): void => {
    const index = sectionIndexFromValidationPath(issue.path)
    if (index === null || index < 0 || index >= sectionCount) {
      unmapped[severity].push(issue)
      return
    }
    const bucket = bySection.get(index) ?? { errors: [], warnings: [] }
    bucket[severity].push(issue)
    bySection.set(index, bucket)
  }

  result.errors.forEach((issue) => add(issue, 'errors'))
  result.warnings.forEach((issue) => add(issue, 'warnings'))

  return {
    bySection,
    unmapped,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
  }
}

export function sectionIssueCounts(
  grouping: GroupedHomepageValidation | null,
  index: number,
): { errors: number; warnings: number } {
  const bucket = grouping?.bySection.get(index)
  return {
    errors: bucket?.errors.length ?? 0,
    warnings: bucket?.warnings.length ?? 0,
  }
}

/** Find validation issues for a field and its descendants, including arrays. */
export function validationIssuesForField(
  issues: HomepageValidationIssue[],
  basePath: string,
  relativePath: string,
): HomepageValidationIssue[] {
  const full = `${basePath}.${relativePath}`
  return issues.filter(
    (issue) =>
      issue.path === full ||
      issue.path.startsWith(`${full}.`) ||
      issue.path.startsWith(`${full}[`),
  )
}

export function firstValidationMessage(
  issues: HomepageValidationIssue[],
  basePath: string,
  relativePath: string,
): string | null {
  return validationIssuesForField(issues, basePath, relativePath)[0]?.message ?? null
}
