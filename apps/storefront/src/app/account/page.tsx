import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/ecommerce/ui/placeholder-page';

export const metadata: Metadata = { title: 'حساب کاربری' };

/** Account placeholder (SS-124): customer auth arrives in a later milestone. */
export default function AccountPage() {
  return (
    <PlaceholderPage
      title="حساب کاربری"
      message="ورود و ثبت‌نام مشتریان در مرحله بعدی توسعه فعال میشود. در حال حاضر میتوانید بدون حساب کاربری از فروشگاه دیدن کنید و قیمت‌های خرد را مشاهده کنید."
    />
  );
}
