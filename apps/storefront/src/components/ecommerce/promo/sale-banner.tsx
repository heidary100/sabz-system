import Link from 'next/link';
import type { SaleBannerConfig } from '@/config/home';
import { CountdownTimer } from '@/components/ecommerce/ui/countdown-timer';

/**
 * Site-wide sale countdown bar (SS-224): the «حراج» pattern from the live
 * site — a slim accent strip with the remaining time. Rendered only from an
 * explicitly configured window (`homeConfig.saleBanner`); the countdown
 * itself hides once the window expires (client), leaving the text until the
 * next render. The real sale engine (windows from pricing rules) arrives
 * with SS-235.
 */
export function SaleBanner({ banner }: { banner: SaleBannerConfig }) {
  return (
    <div className="bg-sabz-700 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold">🎉 {banner.text}</p>
        <CountdownTimer endsAt={banner.endsAt} size="sm" />
        {banner.href ? (
          <Link
            href={banner.href}
            className="min-h-9 rounded-sm text-sm font-medium underline decoration-sabz-200 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            مشاهده
          </Link>
        ) : null}
      </div>
    </div>
  );
}
