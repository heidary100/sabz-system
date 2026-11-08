import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('homepage composition', () => {
  it('keeps the server page free of a client boundary', () => {
    expect(source.startsWith("'use client'")).toBe(false);
    expect(source).toContain('await connection()');
  });

  it('renders the curated Task 04 section order', () => {
    const order = [
      '<HeroStage',
      '<TrustStrip',
      '<CategoryDiscovery',
      '<OfferStrip',
      '<SplitCampaign',
      '<CompactProductList',
      '<ProductRail',
      '<BrandShowcase',
      '<BlogTeaser',
    ];
    const indices = order.map((marker) => source.indexOf(marker));
    for (const [index, marker] of order.entries()) {
      expect(indices[index], `${marker} must be rendered`).toBeGreaterThan(-1);
    }
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('does not revive the superseded homepage sections', () => {
    for (const marker of [
      '<CategoryBanners',
      '<CategoryTile',
      '<AppSection',
      'alphabeticalLimit',
      '<HeroSlider',
    ]) {
      expect(source).not.toContain(marker);
    }
  });

  it('fetches every homepage collection server-side', () => {
    expect(source).toContain('fetchCategoryTree()');
    expect(source).toContain('fetchCategoryCovers(');
    expect(source).toContain('fetchProducts(');
    expect(source).toContain('productItems(');
  });
});
