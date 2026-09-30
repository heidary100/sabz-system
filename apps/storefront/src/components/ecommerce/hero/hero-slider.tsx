'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { HeroSlide } from '@/config/home';

const AUTOPLAY_MS = 6000;

/**
 * Cinematic hero slider (SS-224, reworked SS-246): a CSS scroll-snap track of
 * dark ink slides with brand glows, autoplay with a visible progress bar, an
 * explicit play/pause control, and staggered copy reveals per active slide.
 *
 * Autoplay pauses on hover, on any focus inside the slider, and when the tab
 * is hidden (WCAG 2.2.2: moving content >5s needs a pause control — the
 * button plus hover/focus pauses cover it). Reduced-motion users get a
 * static slider: autoplay never starts and the reveal/progress animations
 * collapse to instant via the global rule.
 *
 * RTL scroll math: in RTL, `scrollLeft` runs 0 → −width, so the active
 * index uses |scrollLeft| and programmatic scrolling flips the sign.
 */
export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedRef = useRef(false);

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
    track.scrollTo({ left: direction * index * track.clientWidth, behavior: 'smooth' });
    setActive(index);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      reducedRef.current = event.matches;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (slides.length <= 1 || paused || reducedRef.current) {
      return;
    }
    const interval = setInterval(() => {
      // Hidden tabs never advance; browsers already throttle the timer, but
      // skipping keeps the progress bar and the index in lockstep.
      if (document.hidden) {
        return;
      }
      setActive((current) => {
        const next = (current + 1) % slides.length;
        goTo(next);
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(interval);
  }, [paused, slides.length, goTo]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  return (
    <section
      aria-label="معرفی فروشگاه"
      className="bg-gradient-ink"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          resume();
        }
      }}
      data-paused={paused}
    >
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
              data-active={active === index}
              className="relative min-w-full snap-start overflow-hidden"
            >
              {/* Accent glows — purely decorative, aria-hidden. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 start-1/4 size-96 rounded-full bg-sabz-600/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-32 end-8 size-72 rounded-full bg-sabz-500/15 blur-3xl"
              />
              {/* Decorative ring motif (SS-246): ties the typographic stage
                  to the brand's circular mark without imagery. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-24 top-1/2 hidden size-[28rem] -translate-y-1/2 rounded-full border border-white/5 lg:block"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-10 top-1/2 hidden size-[18rem] -translate-y-1/2 rounded-full border border-sabz-500/10 lg:block"
              />
              <div className="relative flex min-h-80 flex-col items-start justify-center gap-5 px-6 py-20 sm:min-h-96 sm:px-12 lg:min-h-[28rem] lg:px-20">
                <div className="hero-copy max-w-3xl">
                  <p className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-sabz-300 ring-1 ring-inset ring-white/10">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-sabz-400" />
                    سبز سیستم
                  </p>
                  <h1 className="mt-4 text-balance text-3xl font-black leading-[1.25] text-white sm:text-4xl lg:text-5xl">
                    {slide.title}
                  </h1>
                  {slide.subtitle ? (
                    <p className="mt-4 max-w-xl text-sm leading-7 text-gray-300 sm:text-base sm:leading-8">
                      {slide.subtitle}
                    </p>
                  ) : null}
                  <Link
                    href={slide.href}
                    className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-sabz px-7 text-sm font-bold text-white shadow-lift transition-all duration-300 ease-[var(--ease-swift)] hover:scale-[1.03] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.98]"
                  >
                    {slide.ctaLabel}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>

        {slides.length > 1 ? (
          <>
            {/* RTL reading order: the first slide sits on the right, so
                «قبلی» backs toward the start (right side, right-pointing)
                and «بعدی» advances leftward (left side, left-pointing). */}
            <button
              type="button"
              onClick={() => goTo((active - 1 + slides.length) % slides.length)}
              className="absolute start-4 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:inline-flex"
            >
              <span className="sr-only">اسلاید قبلی</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                <path fillRule="evenodd" d="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => goTo((active + 1) % slides.length)}
              className="absolute end-4 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:inline-flex"
            >
              <span className="sr-only">اسلاید بعدی</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                <path fillRule="evenodd" d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="absolute bottom-6 start-1/2 flex translate-x-1/2 items-center gap-3">
              <div
                role="group"
                aria-label="انتخاب اسلاید"
                className="flex items-center gap-2"
              >
                {slides.map((slide, index) => (
                  <button
                    key={slide.href + slide.title}
                    type="button"
                    onClick={() => goTo(index)}
                    aria-label={`رفتن به اسلاید ${index + 1}`}
                    aria-current={active === index}
                    className={`h-2 rounded-full transition-all duration-300 ease-[var(--ease-swift)] ${
                      active === index
                        ? 'w-7 bg-sabz-400'
                        : 'w-2 bg-white/30 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
              {/* Autoplay pause control (WCAG 2.2.2): explicit stop/go next
                  to the dots; hover/focus pausing is the soft fallback. */}
              <button
                type="button"
                onClick={() => (paused ? resume() : pause())}
                aria-pressed={paused}
                aria-label={paused ? 'پخش خودکار اسلایدها' : 'توقف پخش خودکار'}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-sm transition-colors hover:bg-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                {paused ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3.5">
                    <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3.5">
                    <path d="M5.75 3.5a.75.75 0 0 1 .75.75v11.5a.75.75 0 0 1-1.5 0V4.25a.75.75 0 0 1 .75-.75Zm8.5 0a.75.75 0 0 1 .75.75v11.5a.75.75 0 0 1-1.5 0V4.25a.75.75 0 0 1 .75-.75Z" />
                  </svg>
                )}
              </button>
            </div>
            {/* Slide progress: the active bar fills over AUTOPLAY_MS; keyed
                by the active index so it restarts on every slide change and
                pauses in place via animation-play-state. */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 start-0 h-0.5 w-full bg-white/5"
            >
              {slides.map((slide, index) => (
                <span
                  key={slide.href + slide.title}
                  className="hero-progress absolute inset-y-0 start-0 bg-gradient-to-l from-sabz-400 to-sabz-600"
                  style={{
                    width: `${100 / slides.length}%`,
                    insetInlineStart: `${(index * 100) / slides.length}%`,
                    animationDuration: `${AUTOPLAY_MS}ms`,
                    animationPlayState: paused ? 'paused' : 'running',
                    display: active === index ? 'block' : 'none',
                  }}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
