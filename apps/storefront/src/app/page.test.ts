import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('homepage composition boundary', () => {
  it('keeps the server page free of a client boundary', () => {
    expect(source.startsWith("'use client'")).toBe(false);
    expect(source).toContain('await connection()');
  });

  it('uses the published homepage API as the only section source', () => {
    expect(source).toContain('fetchPublishedHomepage()');
    expect(source).toContain('<PublishedHomepage');
    expect(source).toContain('<HomepageState');
  });

  it('does not retain the old static homepage composition or queries', () => {
    for (const marker of [
      'homeConfig',
      'fetchCategoryTree',
      'fetchCategoryCovers',
      'fetchProducts',
      'productItems',
      'HeroStage',
      'SplitCampaign',
      'BlogTeaser',
      '<AnnouncementBar',
      '<SaleBanner',
    ]) {
      expect(source).not.toContain(marker);
    }
  });

  it('covers every explicit API outcome', () => {
    expect(source).toContain("result.status === 'published'");
    expect(source).toContain("result.status === 'empty'");
    expect(source).toContain('data-homepage-source="unavailable"');
    expect(source).toContain('published-empty');
  });
});
