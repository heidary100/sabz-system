import { describe, expect, it } from 'vitest'
import type { HomepageDraftValidationResult } from '@sabz/types'
import {
  HOMEPAGE_SECTION_REGISTRY,
  HOMEPAGE_SECTION_TYPE_ORDER,
  appendHomepageSection,
  appendHomepageSectionWithSettings,
  createDefaultSection,
  generateSectionKey,
  groupHomepageValidation,
  isSafeHomepageActionHref,
  moveHomepageSection,
  normalizeSectionOrder,
  removeHomepageSection,
  sectionIndexFromValidationPath,
  sectionsEqual,
  toggleSectionVisibility,
} from './merchandising-homepage'

function section(type: 'TRUST_STRIP' | 'READY_TO_SHIP', key: string, order: number) {
  return createDefaultSection(type, key, order)!
}

describe('homepage section registry and defaults (SS-276)', () => {
  it('registers all nine supported types; campaign-backed types require initial selection', () => {
    expect(HOMEPAGE_SECTION_TYPE_ORDER).toHaveLength(9)
    expect(Object.keys(HOMEPAGE_SECTION_REGISTRY)).toHaveLength(9)
    expect(
      Object.values(HOMEPAGE_SECTION_REGISTRY).every(
        (definition) => definition.canAdd,
      ),
    ).toBe(true)
    expect(
      Object.values(HOMEPAGE_SECTION_REGISTRY)
        .filter((definition) => definition.requiresInitialCampaign)
        .map((definition) => definition.type)
        .sort(),
    ).toEqual([
      'BRAND_SHOWCASE',
      'CATEGORY_DISCOVERY',
      'CATEGORY_SPOTLIGHT',
      'HERO_CAROUSEL',
      'OFFER_STRIP',
    ])
  })

  it('creates structurally valid defaults for the four addable types', () => {
    for (const type of ['TRUST_STRIP', 'READY_TO_SHIP', 'PRODUCT_RAIL', 'BLOG_FEATURE'] as const) {
      const created = createDefaultSection(type, `${type.toLowerCase()}-key`, 2)
      expect(created).not.toBeNull()
      expect(created).toMatchObject({
        type,
        key: `${type.toLowerCase()}-key`,
        order: 2,
        isVisible: true,
      })
    }
    expect(createDefaultSection('HERO_CAROUSEL', 'hero-key', 0)).toBeNull()
    expect(createDefaultSection('CATEGORY_DISCOVERY', 'category-key', 0)).toBeNull()
  })

  it('generates unique keys that satisfy the backend pattern', () => {
    const first = generateSectionKey('TRUST_STRIP', [], () => 0.5)
    const second = generateSectionKey('TRUST_STRIP', [first], () => 0.5)
    expect(first).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
    expect(second).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
    expect(second).not.toBe(first)
  })

  it('inserts sections with selected initial settings and normalizes order', () => {
    const next = appendHomepageSectionWithSettings(
      [section('TRUST_STRIP', 'trust-existing', 3)],
      'HERO_CAROUSEL',
      { campaignIds: ['campaign-1'] },
      () => 0.5,
    )
    expect('error' in next).toBe(false)
    if ('error' in next) return
    expect(next.sections).toHaveLength(2)
    expect(next.sections[1]).toMatchObject({
      type: 'HERO_CAROUSEL',
      order: 1,
      isVisible: true,
      settings: { campaignIds: ['campaign-1'] },
    })
    expect(next.index).toBe(1)
    expect(next.sections[1]?.key).not.toBe('trust-existing')
  })

  it('validates safe product-rail internal hrefs', () => {
    expect(isSafeHomepageActionHref('/products')).toBe(true)
    expect(isSafeHomepageActionHref('/categories/tools?page=2')).toBe(true)
    expect(isSafeHomepageActionHref('/blog/post-1')).toBe(true)
    expect(isSafeHomepageActionHref('https://example.com')).toBe(false)
    expect(isSafeHomepageActionHref('//evil.example')).toBe(false)
    expect(isSafeHomepageActionHref('/admin/products')).toBe(false)
    expect(isSafeHomepageActionHref('javascript:alert(1)')).toBe(false)
  })

  it('rejects unsupported/configured-later types and respects the section maximum', () => {
    expect(appendHomepageSection([], 'HERO_CAROUSEL')).toEqual({
      error: expect.stringContaining('انتخاب اولیه کمپین'),
    })

    const full = Array.from({ length: 12 }, (_, index) =>
      section('TRUST_STRIP', `trust-${index}`, index),
    )
    expect(appendHomepageSection(full, 'TRUST_STRIP')).toEqual({
      error: expect.stringContaining('حداکثر'),
    })
  })
})

describe('homepage section ordering (SS-276)', () => {
  it('normalizes order to array indexes after move and removal', () => {
    const sections = [
      section('TRUST_STRIP', 'a', 10),
      section('READY_TO_SHIP', 'b', 20),
      section('TRUST_STRIP', 'c', 30),
    ]

    expect(normalizeSectionOrder(sections).map((item) => item.order)).toEqual([
      0, 1, 2,
    ])
    const moved = moveHomepageSection(normalizeSectionOrder(sections), 0, 1)
    expect(moved.map((item) => item.key)).toEqual(['b', 'a', 'c'])
    expect(moved.map((item) => item.order)).toEqual([0, 1, 2])

    const removed = removeHomepageSection(moved, 1)
    expect(removed.map((item) => item.key)).toEqual(['b', 'c'])
    expect(removed.map((item) => item.order)).toEqual([0, 1])
  })

  it('toggles visibility without changing order or identity', () => {
    const sections = normalizeSectionOrder([
      section('TRUST_STRIP', 'a', 0),
      section('READY_TO_SHIP', 'b', 1),
    ])
    const next = toggleSectionVisibility(sections, 1)
    expect(next[1]?.isVisible).toBe(false)
    expect(next.map((item) => item.order)).toEqual([0, 1])
    expect(sectionsEqual(next, sections)).toBe(false)
    expect(sectionsEqual(sections, toggleSectionVisibility(next, 1))).toBe(true)
  })
})

describe('homepage validation mapping (SS-276)', () => {
  const result: HomepageDraftValidationResult = {
    revision: 4,
    schemaVersion: 1,
    valid: false,
    errors: [
      {
        path: 'sections[0].settings.limit',
        code: 'INVALID_INTEGER',
        message: 'محدودیت نامعتبر است.',
        severity: 'ERROR',
        category: 'STRUCTURAL',
      },
      {
        path: 'sections[2].settings',
        code: 'OUT_OF_RANGE',
        message: 'بخش خارج از محدوده.',
        severity: 'ERROR',
        category: 'STRUCTURAL',
      },
      {
        path: 'campaign:virtual',
        code: 'MISSING_CAMPAIGN',
        message: 'کمپین پیدا نشد.',
        severity: 'ERROR',
        category: 'MISSING_REFERENCE',
      },
    ],
    warnings: [
      {
        path: 'sections[1].settings.subtitle',
        code: 'WARNING',
        message: 'هشدار.',
        severity: 'WARNING',
        category: 'WARNING',
      },
    ],
  }

  it('maps section paths while preserving unknown and out-of-range paths', () => {
    expect(sectionIndexFromValidationPath('sections[0]')).toBe(0)
    expect(sectionIndexFromValidationPath('sections[3].settings')).toBe(3)
    expect(sectionIndexFromValidationPath('sections')).toBeNull()
    expect(sectionIndexFromValidationPath('campaign:virtual')).toBeNull()

    const grouped = groupHomepageValidation(result, 2)
    expect(grouped.bySection.get(0)?.errors).toHaveLength(1)
    expect(grouped.bySection.get(1)?.warnings).toHaveLength(1)
    expect(grouped.unmapped.errors).toHaveLength(2)
    expect(grouped.unmapped.errors.map((issue) => issue.path)).toContain(
      'sections[2].settings',
    )
    expect(grouped.unmapped.errors.map((issue) => issue.path)).toContain(
      'campaign:virtual',
    )
    expect(grouped.errorCount).toBe(3)
    expect(grouped.warningCount).toBe(1)
  })
})
