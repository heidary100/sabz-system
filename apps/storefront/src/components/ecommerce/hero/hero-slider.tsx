'use client';

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import type { HeroSlide } from '@/config/home';

/**
 * Cinematic hero slider (SS-224): a CSS scroll-snap track of dark ink
 * slides with an accent glow, dots and arrow controls. No autoplay — the
 * customer stays in control, and no motion exists to suppress under
 * reduced-motion beyond the smooth scroll (the global rule already
 * collapses it to instant jumps).
 *
 * RTL scroll math: in RTL, `scrollLeft` runs 0 → −width, so the active
 * index uses |scrollLeft| and programmatic scrolling flips the sign.
 */
export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const index = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    setActive(Math.min(index, slides.length - 1));
  }, [slides.length]);

  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const direction = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    track.scrollTo({ left: direction * index * track.clientWidth });
    setActive(index);
  }, []);

  return (
    <section aria-label="معرفی فروشگاه" className="bg-ink-950">
      <div className="relative mx-auto max-w-7xl">
        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {slides.map((slide, index) => (
            <article
              key={slide.href + slide.title}
              aria-roledescription="اسلاید"
              aria-label={`${index + 1} از ${slides.length}`}
              className="relative min-w-full snap-start overflow-hidden"
            >
              {/* Accent glow decoration — purely decorative, aria-hidden. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 start-1/4 size-96 rounded-full bg-sabz-600/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-32 end-8 size-72 rounded-full bg-sabz-500/15 blur-3xl"
              />
              <div className="relative flex min-h-72 flex-col items-start justify-center gap-4 px-6 py-16 sm:min-h-96 sm:px-12 lg:min-h-[26rem] lg:px-20">
                <p className="text-xs font-semibold tracking-wide text-sabz-300">
                  سبز سیستم
                </p>
                <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                  {slide.title}
                </h1>
                {slide.subtitle ? (
                  <p className="max-w-xl text-sm leading-7 text-gray-300 sm:text-base">
                    {slide.subtitle}
                  </p>
                ) : null}
                <Link
                  href={slide.href}
                  className="mt-2 inline-flex min-h-12 items-center justify-center rounded-md bg-sabz-500 px-6 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-sabz-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {slide.ctaLabel}
                </Link>
              </div>
            </article>
          ))}
        </div>

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => goTo((active - 1 + slides.length) % slides.length)}
              className="absolute end-4 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:inline-flex"
            >
              <span className="sr-only">اسلاید قبلی</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                <path fillRule="evenodd" d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo((active + 1) % slides.length)}
              className="absolute start-4 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:inline-flex"
            >
              <span className="sr-only">اسلاید بعدی</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                <path fillRule="evenodd" d="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <div
              role="group"
              aria-label="انتخاب اسلاید"
              className="absolute bottom-5 start-1/2 flex -translate-x-1/2 items-center gap-2"
            >
              {slides.map((slide, index) => (
                <button
                  key={slide.href + slide.title}
                  type="button"
                  onClick={() => goTo(index)}
                  aria-label={`رفتن به اسلاید ${index + 1}`}
                  aria-current={active === index}
                  className={`h-2 rounded-full transition-all ${
                    active === index ? 'w-6 bg-sabz-400' : 'w-2 bg-white/40 hover:bg-white/70'
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
