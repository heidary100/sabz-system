'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { CatalogProductMediaDto } from '@sabz/types';
import { mediaUrl } from '@/lib/catalog';

/**
 * Product gallery (SS-127), adapted from the ecommerce-v4 product-overview
 * gallery: primary image first, thumbnails strip, and inline video playback
 * for VIDEO media.
 */
export function ProductGallery({
  name,
  media,
}: {
  name: string;
  media: CatalogProductMediaDto[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  // The media.length === 0 branch above guarantees at least one item.
  const active = (media[activeIndex] ?? media[0])!;

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

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-sand-100">
        {active.mediaType === 'VIDEO' ? (
          <video
            key={active.id}
            src={mediaUrl(active.url) ?? undefined}
            controls
            preload="metadata"
            className="size-full"
          />
        ) : (
          <Image
            src={mediaUrl(active.url) ?? ''}
            alt={name}
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
          />
        )}
      </div>

      {media.length > 1 ? (
        <ul role="list" className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {media.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`relative block size-20 overflow-hidden rounded-lg border-2 ${
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
                    src={mediaUrl(item.thumbnailUrl ?? item.url) ?? ''}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                )}
                <span className="sr-only">
                  {item.mediaType === 'VIDEO' ? 'نمایش ویدیو' : `تصویر ${index + 1}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
