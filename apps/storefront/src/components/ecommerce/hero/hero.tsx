import Link from 'next/link';
import { buttonVariants } from '@/components/ecommerce/ui/button';

/**
 * Home hero (SS-215). Deliberately factual and media-independent: a
 * typographic block with two stable CTAs (`/products`, `/categories`).
 *
 * No marketing claims (warranty, authenticity, shipping, history) and no
 * `categories[0]`-style positional destination — both CTAs resolve to real
 * routes regardless of catalog state. Copy lives here in one place so final
 * marketing text can replace it without touching layout.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="home-hero-heading"
      className="border-b border-sand-200 bg-white"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 sm:py-16 lg:px-8">
        <h1
          id="home-hero-heading"
          className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl"
        >
          فروشگاه کالای دیجیتال سبز سیستم
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-600">
          موبایل، لوازم جانبی، رایانه و گجت‌های هوشمند را از میان
          دسته‌بندی‌های فروشگاه پیدا کنید. قیمت‌ها به تومان و برای خرید
          خرد نمایش داده می‌شود.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/products" className={buttonVariants({ size: 'lg' })}>
            مشاهده محصولات
          </Link>
          <Link
            href="/categories"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            مشاهده دسته‌بندی‌ها
          </Link>
        </div>
      </div>
    </section>
  );
}
