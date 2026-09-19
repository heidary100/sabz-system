import type { Metadata } from 'next';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { fetchCategoryTree } from '@/lib/catalog';
import { SiteHeader } from '@/components/ecommerce/header/site-header';
import { SiteFooter } from '@/components/ecommerce/footer/site-footer';

export const metadata: Metadata = {
  title: {
    default: 'سبز سیستم',
    template: '%s | سبز سیستم',
  },
  description: 'فروشگاه آنلاین کالای دیجیتال و لوازم جانبی — خرده و عمده.',
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
        <SiteHeader categories={categories} />
        <main className="flex-1">{children}</main>
        <SiteFooter categories={categories} />
      </body>
    </html>
  );
}
