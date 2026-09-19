import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/ecommerce/ui/placeholder-page';

export const metadata: Metadata = { title: 'تماس با ما' };

export default function ContactPage() {
  return (
    <PlaceholderPage
      title="تماس با ما"
      message="راههای ارتباط با پشتیبانی سبز سیستم بهزودی در این صفحه قرار میگیرد. تا آن زمان میتوانید از طریق شبکههای اجتماعی با ما در ارتباط باشید."
      actionLabel="بازگشت به فروشگاه"
      actionHref="/products"
    />
  );
}
