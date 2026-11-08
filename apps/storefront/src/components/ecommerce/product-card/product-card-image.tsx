'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Card image with a real load-failure fallback. `next/image` can fail after
 * SSR (missing thumbnail, optimizer error), so the fallback must be a client
 * state swap rather than a null check alone. The image stays on the light
 * plate; no filter or colour transform is applied.
 */
export function ProductCardImage({
  src,
  sizes,
  className = '',
}: {
  src: string | null;
  sizes: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        data-testid="product-image-fallback"
        className="flex h-full w-full items-center justify-center text-plate-muted"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
          className="size-10"
        >
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
    <Image
      src={src}
      alt=""
      fill
      sizes={sizes}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
