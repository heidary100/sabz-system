'use client';

import Image from 'next/image';
import { useState } from 'react';
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

  if (media.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl bg-sand-100 text-sabz-300">
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

  return (
    <div>
      <div
        role="region"
        aria-roledescription="نگارخانه محصول"
        aria-label={`${name}: ${positionLabel}`}
        className="relative aspect-square overflow-hidden rounded-2xl bg-sand-100"
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
                className={`relative block size-20 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:ring-2 focus-visible:ring-sabz-600 focus-visible:outline-none ${
                  index === activeIndex ? 'border-sabz-600' : 'border-transparent'
                }`}
              >
                {item.mediaType === 'VIDEO' ? (
                  <span className="flex size-full items-center justify-center bg-sand-100 text-sabz-600">
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
    </div>
  );
}
