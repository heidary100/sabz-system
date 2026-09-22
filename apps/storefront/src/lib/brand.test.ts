import { describe, expect, it } from 'vitest';
import { brand } from './brand';

/**
 * SS-209: the brand config is the single source every logo consumer reads.
 * These tests pin the contract — served paths, sizes and fallbacks — so a
 * future logo swap that renames files fails loudly instead of rendering
 * broken images.
 */
describe('brand config (SS-209)', () => {
  it('serves every asset from the centralized /brand/ kit', () => {
    const paths = [
      brand.logo,
      brand.icons.icon32,
      brand.icons.appleTouchIcon,
      brand.openGraph.image,
      ...Object.values(brand.logoPng).map((variant) => variant.src),
    ];
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.startsWith('/brand/')).toBe(true);
      expect(path.endsWith('.svg')).toBe(false);
    }
  });

  it('keeps PNG variant dimensions truthful', () => {
    for (const [size, variant] of Object.entries(brand.logoPng)) {
      expect(variant.width).toBe(Number(size));
      expect(variant.height).toBe(Number(size));
    }
  });

  it('serves the nav mark at retina density (64px file, 32 CSS px)', () => {
    expect(brand.logoPng[64]).toBeDefined();
    expect(brand.markSize).toBe(32);
  });

  it('declares the OG image at the real 1200x630 file size', () => {
    expect(brand.openGraph.width).toBe(1200);
    expect(brand.openGraph.height).toBe(630);
  });

  it('provides Persian names for UI and English for metadata', () => {
    expect(brand.nameFa).toBeTruthy();
    expect(brand.logoAlt).toBeTruthy();
    expect(brand.nameEn).toBeTruthy();
  });
});
