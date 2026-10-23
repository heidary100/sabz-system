import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { brand } from '@/lib/brand';
import { fetchCategoryTree } from '@/lib/catalog';
import { siteUrl } from '@/lib/site-url';
import { CartProvider } from '@/components/ecommerce/cart/cart-provider';
import { CompareProvider } from '@/components/ecommerce/compare/compare-provider';
import { SiteHeader } from '@/components/ecommerce/header/site-header';
import { SiteFooter } from '@/components/ecommerce/footer/site-footer';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'سبز سیستم',
    template: '%s | سبز سیستم',
  },
  description: 'فروشگاه آنلاین کالای دیجیتال و لوازم جانبی — خرده و عمده.',
  icons: {
    icon: [{ url: brand.icons.icon32, sizes: '32x32', type: 'image/png' }],
    apple: [{ url: brand.icons.appleTouchIcon, sizes: '180x180' }],
  },
  openGraph: {
    title: 'سبز سیستم',
    description: 'فروشگاه آنلاین کالای دیجیتال و لوازم جانبی — خرده و عمده.',
    locale: 'fa_IR',
    siteName: brand.nameFa,
    images: [
      {
        url: brand.openGraph.image,
        width: brand.openGraph.width,
        height: brand.openGraph.height,
        alt: brand.logoAlt,
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // The shell never blocks on catalog availability: a down API renders the
  // chrome with empty navigation (the data functions already degrade).
  const categories = await fetchCategoryTree();

  return (
    <html lang="fa" dir="rtl">
      <body className="flex min-h-dvh flex-col bg-sand-50 font-sans text-ink-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-sabz-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          پرش به محتوای اصلی
        </a>
        <CartProvider>
          <CompareProvider>
          <SiteHeader categories={categories} />
          {/* scroll-mt keeps skip-link/anchor focus from landing under the
              sticky header (SS-218). */}
          <main id="main" className="scroll-mt-24 flex-1">{children}</main>
          <SiteFooter categories={categories} />
          </CompareProvider>
        </CartProvider>
      </body>
    </html>
  );
}
