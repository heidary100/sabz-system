import { validateHomepageDraftSections } from '../homepage-section-validation';
import { DEMO_SEED_MANIFEST } from './manifest';
import { validateManifestContent } from './content-validation';
import { buildHomepageSections } from './planner';
import { approvedManifest, uuid } from './test-fixtures';
import type { DemoSeedManifest } from './types';

function sectionRefs(manifest: DemoSeedManifest) {
  const campaignIds: Record<string, string> = {};
  for (const [index, campaign] of manifest.campaigns.entries()) {
    campaignIds[campaign.key] = uuid(6000 + index);
  }
  const blogPostIds: Record<string, string> = {};
  for (const [index, article] of manifest.blog.entries()) {
    blogPostIds[article.key] = uuid(7000 + index);
  }
  return {
    campaignIds,
    blogPostIds,
    spotlightCategoryId: uuid(2000),
  };
}

describe('homepage demo seed manifest', () => {
  it('contains all nine supported section types in the intended order', () => {
    expect(DEMO_SEED_MANIFEST.sections.map((section) => section.type)).toEqual([
      'HERO_CAROUSEL',
      'TRUST_STRIP',
      'CATEGORY_DISCOVERY',
      'OFFER_STRIP',
      'CATEGORY_SPOTLIGHT',
      'READY_TO_SHIP',
      'PRODUCT_RAIL',
      'BRAND_SHOWCASE',
      'BLOG_FEATURE',
    ]);
    expect(DEMO_SEED_MANIFEST.sections.map((section) => section.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('keeps every content approval pending by default', () => {
    expect(
      Object.values(DEMO_SEED_MANIFEST.approvals).every(
        (approval) => !approval.approved,
      ),
    ).toBe(true);
  });

  it('uses explicit placeholders instead of invented business claims', () => {
    const serialized = JSON.stringify(DEMO_SEED_MANIFEST);
    expect(serialized).toContain('PENDING APPROVAL');
    expect(serialized).not.toContain('ارسال سریع');
    expect(serialized).not.toContain('تضمین اصالت');
    expect(serialized).not.toContain('۲۴ ساعت مهلت');
  });

  it('rejects placeholder and unresolved content independently of approvals', () => {
    const issues = validateManifestContent(DEMO_SEED_MANIFEST);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((issue) => /Placeholder/.test(issue.message))).toBe(true);

    const approved = approvedManifest();
    expect(validateManifestContent(approved)).toEqual([]);
    approved.campaigns[0]!.copy.titleFa = 'PENDING APPROVAL — campaign';
    expect(validateManifestContent(approved)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringMatching(/Placeholder/),
        }),
      ]),
    );
  });

  it('builds a structurally valid nine-section draft payload', () => {
    const manifest = approvedManifest();
    const sections = buildHomepageSections(
      manifest,
      sectionRefs(manifest),
    );
    expect(sections).toHaveLength(9);
    const validation = validateHomepageDraftSections(sections);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('fails rather than emitting unresolved campaign or blog references', () => {
    const manifest = approvedManifest();
    expect(() =>
      buildHomepageSections(manifest, {
        campaignIds: {},
        blogPostIds: {},
        spotlightCategoryId: uuid(2000),
      }),
    ).toThrow(/Missing campaign id/);
  });
});
