import Link from 'next/link';
import { brand } from '@/lib/brand';

export const metadata = { title: 'آفلاین — سبز سیستم' };

/** Safe offline fallback: no price, stock, or account data is cached. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6">
      <span className="flex size-16 items-center justify-center rounded-panel bg-accent-soft text-accent">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-8">
          <path d="M8.25 10.5a8.25 8.25 0 0 1 5.25 1.875m-9.75 3a15 15 0 0 1 3.75-2.4M3 3l18 18M12 18.75h.008v.008H12v-.008ZM5.25 5.25A15 15 0 0 0 3 6.75m18 0a15 15 0 0 0-3.75-2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <h1 className="mt-6 text-2xl font-black text-fg">اتصال اینترنت برقرار نیست</h1>
      <p className="mt-3 text-sm leading-7 text-fg-secondary">
        صفحه‌های عمومی و اطلاعات قیمت و موجودی به‌صورت آفلاین معتبر نیستند. برای
        ادامه خرید، اتصال خود را برقرار کنید.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex min-h-11 items-center rounded-control bg-accent px-6 text-sm font-semibold text-on-accent hover:bg-accent-hover"
      >
        تلاش دوباره برای خانه
      </Link>
      <p className="mt-6 text-xs text-fg-muted">{brand.nameFa}</p>
    </div>
  );
}
