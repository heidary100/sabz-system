'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { HeroSlide } from '@/config/home';
import { limitHeroSlides } from '@/lib/home';

const AUTOPLAY_MS = 7000;

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function subscribeTabVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function getTabHidden() {
  return document.hidden;
}

export interface HeroStageSlide extends HeroSlide {
  /** Representative catalog product images, resolved server-side. */
  images: string[];
}

/**
 * Homepage hero campaign stage (Task 04).
 *
 * A split editorial panel: representative product imagery on the light plate,
 * the campaign copy on a deep-pine stage. Autoplay is limited to this
 * component, pauses on hover/focus/hidden tab, is disabled for reduced motion,
 * and never hides copy behind an entrance animation.
 */
export function HeroStage({ slides }: { slides: HeroStageSlide[] }) {
  const usableSlides = limitHeroSlides(slides);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );
  const tabHidden = useSyncExternalStore(
    subscribeTabVisibility,
    getTabHidden,
    () => false,
  );

  const handleScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) {
      return;
    }
    const index = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    setActive(Math.min(index, usableSlides.length - 1));
  }, [usableSlides.length]);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      const direction = getComputedStyle(track).direction === 'rtl' ? -1 : 1;
      track.scrollTo({
        left: direction * index * track.clientWidth,
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
      setActive(index);
    },
    [reduceMotion],
  );

  useEffect(() => {
    if (
      usableSlides.length <= 1 ||
      paused ||
      tabHidden ||
      reduceMotion
    ) {
      return;
    }
    const interval = setInterval(() => {
      if (document.hidden) {
        return;
      }
      setActive((current) => {
        const next = (current + 1) % usableSlides.length;
        goTo(next);
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(interval);
  }, [paused, tabHidden, reduceMotion, usableSlides.length, goTo]);

  if (usableSlides.length === 0) {
    return <HeroFallback />;
  }

  return (
    <section
      aria-label="معرفی فروشگاه"
      data-home-section="hero"
      data-reduced-motion={reduceMotion}
      className="stage-surface bg-bg pb-2 pt-4 sm:pt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
      data-paused={paused || tabHidden}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-panel border border-border bg-plate">
          <div
            ref={trackRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {usableSlides.map((slide, slideIndex) => (
              <article
                key={`${slide.href}-${slide.title}`}
                aria-roledescription="اسلاید"
                aria-label={`${slideIndex + 1} از ${usableSlides.length}`}
                data-active={active === slideIndex}
                aria-hidden={active !== slideIndex}
                inert={active !== slideIndex}
                className="grid min-w-full snap-start lg:grid-cols-12"
              >
                <div className="relative min-h-[19rem] bg-plate p-4 sm:min-h-[24rem] lg:col-span-7 lg:min-h-[30rem] lg:p-6">
                  <HeroProductStage
                    images={slide.images}
                    priority={slideIndex === 0}
                  />

                  {usableSlides.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          goTo(
                            (active - 1 + usableSlides.length) %
                              usableSlides.length,
                          )
                        }
                        aria-label="اسلاید قبلی"
                        className="absolute start-4 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-pill border border-border bg-surface text-fg transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:inline-flex"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                          className="size-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          goTo((active + 1) % usableSlides.length)
                        }
                        aria-label="اسلاید بعدی"
                        className="absolute end-4 top-1/2 hidden min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-pill border border-border bg-surface text-fg transition-colors hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:inline-flex"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                          className="size-4"
                        >
                          <path
                            fillRule="evenodd"
                            d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="flex flex-col justify-between bg-stage p-6 text-on-stage sm:p-8 lg:col-span-5 lg:p-10">
                  <div>
                    <p className="inline-flex items-center gap-2 rounded-pill bg-on-stage/5 px-3 py-1 text-[11px] font-semibold text-accent-stage ring-1 ring-inset ring-on-stage/10">
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-pill bg-accent-stage"
                      />
                      سبز سیستم
                    </p>
                    <h1 className="mt-5 text-balance text-3xl font-black leading-[1.25] text-on-stage sm:text-4xl lg:text-5xl">
                      {slide.title}
                    </h1>
                    {slide.subtitle ? (
                      <p className="mt-4 max-w-xl text-pretty text-sm leading-7 text-on-stage-secondary sm:text-base sm:leading-8">
                        {slide.subtitle}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <Link
                      href={slide.href}
                      className="inline-flex min-h-12 w-full items-center justify-center rounded-pill bg-on-stage px-7 text-sm font-bold text-stage transition-colors hover:bg-on-stage/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] sm:w-auto"
                    >
                      {slide.ctaLabel}
                    </Link>

                    {usableSlides.length > 1 ? (
                      <div className="flex items-center justify-between gap-2 sm:justify-start">
                        <div
                          role="group"
                          aria-label="انتخاب اسلاید"
                          className="flex items-center gap-1"
                        >
                          {usableSlides.map((item, index) => (
                            <button
                              key={`${item.href}-${item.title}`}
                              type="button"
                              onClick={() => goTo(index)}
                              aria-label={`رفتن به اسلاید ${index + 1}`}
                              aria-current={active === index}
                              className="inline-flex min-h-11 min-w-8 items-center justify-center rounded-control"
                            >
                              <span
                                aria-hidden="true"
                                className={`h-1.5 rounded-pill transition-all duration-200 ${
                                  active === index
                                    ? 'w-7 bg-accent-stage'
                                    : 'w-1.5 bg-on-stage/30'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                        {reduceMotion ? null : (
                          <button
                            type="button"
                            onClick={() => setPaused((value) => !value)}
                            aria-pressed={paused}
                            aria-label={
                              paused
                                ? 'پخش خودکار اسلایدها'
                                : 'توقف پخش خودکار'
                            }
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-on-stage/10 text-on-stage-secondary transition-colors hover:bg-on-stage/25 hover:text-on-stage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                          >
                            {paused ? (
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                              className="size-3.5"
                            >
                              <path d="M6.3 2.84A1.5 1.5 0 0 0 4 4.11v11.78a1.5 1.5 0 0 0 2.3 1.27l9.34-5.89a1.5 1.5 0 0 0 0-2.54L6.3 2.84Z" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                              className="size-3.5"
                            >
                              <path d="M5.75 3.5a.75.75 0 0 1 .75.75v11.5a.75.75 0 0 1-1.5 0V4.25a.75.75 0 0 1 .75-.75Zm8.5 0a.75.75 0 0 1 .75.75v11.5a.75.75 0 0 1-1.5 0V4.25a.75.75 0 0 1 .75-.75Z" />
                            </svg>
                            )}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {usableSlides.length > 1 ? (
            <div
              aria-hidden="true"
              className="absolute bottom-0 start-0 h-0.5 w-full bg-on-stage/10"
            >
              {usableSlides.map((slide, index) => (
                <span
                  key={`${slide.href}-${slide.title}-progress`}
                  className="hero-progress absolute inset-y-0 start-0 bg-accent-stage"
                  style={{
                    width: `${100 / usableSlides.length}%`,
                    insetInlineStart: `${(index * 100) / usableSlides.length}%`,
                    animationDuration: `${AUTOPLAY_MS}ms`,
                    animationPlayState: paused ? 'paused' : 'running',
                    display: active === index ? 'block' : 'none',
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function HeroProductStage({
  images,
  priority,
}: {
  images: string[];
  priority: boolean;
}) {
  if (images.length === 0) {
    return (
      <div className="flex h-full min-h-[17rem] items-center justify-center rounded-card border border-plate-border bg-plate">
        <div className="text-center text-fg-muted">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
            className="mx-auto size-10"
          >
            <rect x="3.75" y="3.75" width="7" height="7" rx="1.5" />
            <rect x="13.25" y="3.75" width="7" height="7" rx="1.5" />
            <rect x="3.75" y="13.25" width="7" height="7" rx="1.5" />
            <rect x="13.25" y="13.25" width="7" height="7" rx="1.5" />
          </svg>
          <p className="mt-3 text-xs font-medium">سبز سیستم</p>
        </div>
      </div>
    );
  }

  if (images.length === 1) {
    return (
      <div className="relative h-full min-h-[17rem] overflow-hidden rounded-card border border-plate-border bg-plate">
        <Image
          src={images[0]!}
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1024px) 58vw, 100vw"
          className="object-contain p-6"
        />
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-[17rem] grid-cols-5 grid-rows-2 gap-3">
      <div className="relative col-span-3 row-span-2 overflow-hidden rounded-card border border-plate-border bg-plate">
        <Image
          src={images[0]!}
          alt=""
          fill
          priority={priority}
          sizes="(min-width: 1024px) 34vw, 60vw"
          className="object-contain p-4 sm:p-6"
        />
      </div>
      {[images[1], images[2]].map((image, index) =>
        image ? (
          <div
            key={`${image}-${index}`}
            className="relative col-span-2 overflow-hidden rounded-card border border-plate-border bg-plate"
          >
            <Image
              src={image}
              alt=""
              fill
              sizes="(min-width: 1024px) 24vw, 40vw"
              className="object-contain p-3"
            />
          </div>
        ) : null,
      )}
    </div>
  );
}

function HeroFallback() {
  return (
    <section
      data-home-section="hero"
      aria-label="معرفی فروشگاه"
      className="pb-2 pt-4 sm:pt-6"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-panel border border-border lg:grid-cols-12">
          <div className="min-h-[19rem] bg-plate p-6 lg:col-span-7" />
          <div className="bg-stage p-8 text-on-stage lg:col-span-5 lg:p-10">
            <p className="text-xs font-semibold text-accent-stage">سبز سیستم</p>
            <h1 className="mt-4 text-3xl font-black leading-tight">
              فروشگاه کالای دیجیتال سبز سیستم
            </h1>
            <p className="mt-3 text-sm leading-7 text-on-stage-secondary">
              موبایل، لوازم جانبی، رایانه و گجت‌های هوشمند
            </p>
            <Link
              href="/products"
              className="mt-7 inline-flex min-h-12 items-center rounded-pill bg-on-stage px-6 text-sm font-bold text-stage"
            >
              مشاهده محصولات
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
