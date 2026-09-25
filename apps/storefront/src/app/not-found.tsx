import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
      <p className="text-5xl font-bold text-sabz-600">۴۰۴</p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink-900">
        صفحه مورد نظر یافت نشد
      </h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        ممکن است محصول حذف شده، به حالت پیش‌نویس برگردانده شده یا آدرس اشتباه
        باشد.
      </p>
      <Link
        href="/products"
        className="mt-8 inline-flex items-center justify-center rounded-md bg-sabz-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sabz-800"
      >
        مشاهده محصولات
      </Link>
    </div>
  );
}
