'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CatalogProductMediaDto } from '@sabz/types';
import { mediaImageUrl, mediaUrl } from '@/lib/catalog';
import { formatFaNumber } from '@/lib/format';

/**
 * Product gallery (SS-127), adapted from the ecommerce-v4 product-overview
 * gallery: primary image first, thumbnails strip, and inline video playback
 * for VIDEO media.
 *
 * SS-214 accessibility: thumbnail buttons expose `aria-pressed` and
 * position labels («تصویر N از M»); the stage is a labelled region with a
 * polite live position announcement; videos carry an accessible name and a
 * poster when available. Gallery stays product-level (variantId reserved).
 */
export function ProductGallery({
  name,
  media,
}: {
  name: string;
  media: CatalogProductMediaDto[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const zoomTriggerRef = useRef<HTMLButtonElement>(null);

  // Lightbox dialog behaviour: Escape closes, body scroll locks while open,
  // and focus returns to the zoom trigger on close (whatever closed it).
  useEffect(() => {
    if (!zoomed) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setZoomed(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      zoomTriggerRef.current?.focus();
    };
  }, [zoomed]);

  if (media.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-panel bg-plate text-plate-muted">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-16">
          <path
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A1.5 1.5 0 0 0 21.75 19.5V4.5A1.5 1.5 0 0 0 20.25 3H3.75A1.5 1.5 0 0 0 2.25 4.5v15A1.5 1.5 0 0 0 3.75 21Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }

  // Non-empty from here on: the active item always resolves.
  const active = (media[activeIndex] ?? media[0])!;
  const total = media.length;
  const positionLabel =
    active.mediaType === 'VIDEO'
      ? `ویدیو ${formatFaNumber(activeIndex + 1)} از ${formatFaNumber(total)}`
      : `تصویر ${formatFaNumber(activeIndex + 1)} از ${formatFaNumber(total)}`;

  const step = (delta: number) => {
    setActiveIndex((index) => (index + delta + total) % total);
  };
  const isImage = active.mediaType === 'IMAGE';
  const showLightbox = zoomed && isImage;

  return (
    <div>
      <div
        role="region"
        aria-roledescription="نگارخانه محصول"
        aria-label={`${name}: ${positionLabel}`}
        className="relative aspect-square overflow-hidden rounded-panel bg-plate"
      >
        {active.mediaType === 'VIDEO' ? (
          <video
            key={active.id}
            src={mediaUrl(active.url) ?? undefined}
            poster={mediaUrl(active.thumbnailUrl) ?? undefined}
            aria-label={`ویدیو محصول: ${name}`}
            controls
            preload="metadata"
            className="size-full"
          />
        ) : (
          <Image
            src={mediaImageUrl(active.url) ?? ''}
            alt={name}
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
        )}
        {/* SS-227: stage arrows — image stages only (videos have controls). */}
        {total > 1 && active.mediaType !== 'VIDEO' ? (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              className="absolute end-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface text-fg transition-colors hover:bg-surface-2"
            >
              <span className="sr-only">تصویر قبلی</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                <path fillRule="evenodd" d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="absolute start-3 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-pill bg-surface text-fg transition-colors hover:bg-surface-2"
            >
              <span className="sr-only">تصویر بعدی</span>
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                <path fillRule="evenodd" d="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
              </svg>
            </button>
          </>
        ) : null}
        {/* SS-227: zoom affordance over image stages — opens the lightbox. */}
        {isImage ? (
          <button
            ref={zoomTriggerRef}
            type="button"
            onClick={() => setZoomed(true)}
            aria-haspopup="dialog"
            className="absolute bottom-3 end-3 inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-surface px-3 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
              <path d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" />
              <path d="M9 6.5a.75.75 0 0 1 .75.75v1.25H11a.75.75 0 0 1 0 1.5H9.75v1.25a.75.75 0 0 1-1.5 0V10H7a.75.75 0 0 1 0-1.5h1.25V7.25A.75.75 0 0 1 9 6.5Z" />
            </svg>
            بزرگنمایی تصویر
          </button>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {positionLabel}
      </p>

      {media.length > 1 ? (
        <div
          role="group"
          aria-label="تصاویر محصول"
          className="mt-4 flex gap-3 overflow-x-auto pb-1"
        >
          {media.map((item, index) => {
            const thumbLabel =
              item.mediaType === 'VIDEO'
                ? `نمایش ویدیو ${formatFaNumber(index + 1)} از ${formatFaNumber(total)}`
                : `تصویر ${formatFaNumber(index + 1)} از ${formatFaNumber(total)}`;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-pressed={index === activeIndex}
                aria-label={thumbLabel}
                className={`relative block size-20 shrink-0 overflow-hidden rounded-control border-2 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none ${
                  index === activeIndex ? 'border-accent' : 'border-transparent'
                }`}
              >
                {item.mediaType === 'VIDEO' ? (
                  <span className="flex size-full items-center justify-center bg-plate text-plate-muted">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-6">
                      <path d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z" />
                    </svg>
                  </span>
                ) : (
                  <Image
                    src={mediaImageUrl(item.thumbnailUrl ?? item.url) ?? ''}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* SS-227 lightbox: full-bleed original in a dialog. Escape/backdrop
          close, arrows step the (image) media, focus lands on close and
          returns to the zoom trigger. Image-only — video playback stays on
          the stage where controls live. */}
      {showLightbox
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`بزرگنمایی: ${name}`}
              className="fixed inset-0 z-50 flex items-center justify-center bg-stage/90 p-4"
              onClick={() => setZoomed(false)}
            >
              <button
                ref={lightboxCloseRef}
                type="button"
                onClick={() => setZoomed(false)}
                autoFocus
                className="absolute end-4 top-4 inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-on-stage/15 text-on-stage transition-colors hover:bg-on-stage/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="sr-only">بستن بزرگنمایی</span>
                <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-6">
                  <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {total > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      step(-1);
                    }}
                    className="absolute end-4 top-1/2 inline-flex min-h-12 min-w-12 -translate-y-1/2 items-center justify-center rounded-pill bg-on-stage/15 text-on-stage transition-colors hover:bg-on-stage/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="sr-only">تصویر قبلی</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-6">
                      <path fillRule="evenodd" d="M12.78 5.22a.75.75 0 0 1 0 1.06L9.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      step(1);
                    }}
                    className="absolute start-4 top-1/2 inline-flex min-h-12 min-w-12 -translate-y-1/2 items-center justify-center rounded-pill bg-on-stage/15 text-on-stage transition-colors hover:bg-on-stage/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="sr-only">تصویر بعدی</span>
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-6">
                      <path fillRule="evenodd" d="M7.22 14.78a.75.75 0 0 1 0-1.06L10.94 10 7.22 6.28a.75.75 0 1 1 1.06-1.06l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0Z" clipRule="evenodd" />
                    </svg>
                  </button>
                </>
              ) : null}
              {/* The lightbox renders through the same-origin image optimizer
                  (like the stage): a raw cross-origin <img> to the API host is
                  blocked by some browsers, while the optimizer fetches the
                  original server-side and serves it same-origin. */}
              <div className="relative flex h-[82vh] w-[92vw] items-center justify-center">
                <Image
                  src={mediaImageUrl(active.url) ?? ''}
                  alt={name}
                  fill
                  priority
                  sizes="(min-width: 1024px) 80vw, 92vw"
                  onClick={(event) => event.stopPropagation()}
                  className="object-contain"
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
