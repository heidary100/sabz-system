import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/ecommerce/ui/placeholder-page';

export const metadata: Metadata = { title: 'درباره ما' };

export default function AboutPage() {
  return (
    <PlaceholderPage
      title="درباره سبز سیستم"
      message="سبز سیستم، فروشگاه تخصصی کالای دیجیتال و لوازم جانبی در مازندران، ارائهدهنده محصولات اصل با ضمانت برای مشتریان خرد و همکاران عمده. متن کامل این صفحه بهزودی تکمیل میشود."
      actionLabel="تماس با ما"
      actionHref="/contact"
    />
  );
}
