/**
 * Centralized storefront brand config (SS-209).
 *
 * Every logo/brand reference in the storefront reads from here — header,
 * footer, mobile drawer, document metadata and link previews. Replacing the
 * logo means swapping files under `public/brand/` (see its README); no
 * component edits are required.
 *
 * The mark is the official Sabz System logo supplied by the client
 * (transparent PNG master, 256px). Derivatives are downscales; the OG and
 * touch icons place the untouched mark on a neutral brand surface.
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
  /** Official transparent PNG master (256×256). */
  logo: '/brand/logo.png' as const,
  /** PNG derivatives keyed by rendered size (next/image). */
  logoPng: {
    64: { src: '/brand/logo-64.png', width: 64, height: 64 },
    128: { src: '/brand/logo-128.png', width: 128, height: 128 },
  } satisfies Record<number, BrandLogoVariant>,
  /** Header/nav mark size in CSS pixels (served from the 128px derivative). */
  markSize: 40,
  icons: {
    icon32: '/brand/icon-32.png',
    icon16: '/brand/icon-16.png',
    appleTouchIcon: '/brand/apple-touch-icon.png',
  },
  openGraph: {
    image: '/brand/og-1200x630.png',
    width: 1200,
    height: 630,
  },
  /** `theme-color` values for browser chrome, per resolved theme (Task 01). */
  themeColors: {
    light: '#f4f6f5',
    dark: '#0f1210',
  },
} as const;

export type Brand = typeof brand;
