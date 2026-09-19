import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/ecommerce/ui/placeholder-page';

export const metadata: Metadata = { title: 'قوانین و مقررات' };

export default function TermsPage() {
  return (
    <PlaceholderPage
      title="قوانین و مقررات"
      message="متن کامل قوانین و مقررات خرید، ارسال، ضمانت و بازگشت کالا بهزودی در این صفحه منتشر میشود."
      actionLabel="بازگشت به فروشگاه"
      actionHref="/products"
    />
  );
}
