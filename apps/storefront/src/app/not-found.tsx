import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <p aria-hidden="true" className="animate-fade-up text-7xl font-black text-accent">۴۰۴</p>
      <h1 className="mt-4 text-balance text-2xl font-extrabold text-fg">
        صفحه مورد نظر یافت نشد
      </h1>
      <p className="mt-3 text-sm leading-6 text-fg-secondary">
        ممکن است محصول حذف شده، به حالت پیش‌نویس برگردانده شده یا آدرس اشتباه
        باشد.
      </p>
      <Link
        href="/products"
        className="mt-8 inline-flex min-h-11 items-center justify-center rounded-pill bg-accent px-6 text-sm font-bold text-on-accent shadow-card transition-all duration-200 ease-[var(--ease-swift)] hover:shadow-panel  hover:bg-accent-hover active:scale-[0.98]"
      >
        مشاهده محصولات
      </Link>
    </div>
  );
}
