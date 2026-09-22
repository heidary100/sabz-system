/**
 * Centralized storefront brand config (SS-209).
 *
 * Every logo/brand reference in the storefront reads from here — header,
 * footer, mobile drawer, document metadata and link previews. Replacing the
 * logo means swapping files under `public/brand/` (see its README); no
 * component edits are required.
 *
 * The mark is the real company logo (vivid-green/grey interlocking-S,
 * transparent background), ingested from the root `company-logo.png` at its
 * native 141px. Derivatives are downscales except the 180px touch icon
 * (mild 1.28x upscale, acceptable interim). A vector master is still wanted
 * for large-size uses (OG, print).
 */

export interface BrandLogoVariant {
  src: string;
  width: number;
  height: number;
}

export const brand = {
  /** Persian wordmark shown beside the mark and used as image `alt` text. */
  nameFa: 'سبز سیستم',
  /** English name for metadata / OG tags. */
  nameEn: 'Sabz System',
  /** Accessible label for the logo image. */
  logoAlt: 'لوگوی سبز سیستم',
  /** Raster master (141px RGBA, transparent background). */
  logo: '/brand/logo.png' as const,
  /** PNG derivatives keyed by rendered size (next/image). */
  logoPng: {
    64: { src: '/brand/logo-64.png', width: 64, height: 64 },
    128: { src: '/brand/logo-128.png', width: 128, height: 128 },
  } satisfies Record<number, BrandLogoVariant>,
  /** Header/nav mark size in CSS pixels (served 2x via logo-64). */
  markSize: 32,
  icons: {
    icon32: '/brand/icon-32.png',
    appleTouchIcon: '/brand/apple-touch-icon.png',
  },
  openGraph: {
    image: '/brand/og-1200x630.png',
    width: 1200,
    height: 630,
  },
  /** `theme-color` / tile color for browser chrome. */
  themeColor: '#344e41',
} as const;

export type Brand = typeof brand;
