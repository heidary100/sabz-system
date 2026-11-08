'use client';

import Image from 'next/image';
import { useState } from 'react';


/**
 * Navigation category cover. The source is a derived representative product
 * image (Task 03), rendered on the intentional light plate. It is decorative
 * beside the always-visible category name, so the image alt is empty. When no
 * eligible image exists, a restrained catalogue-grid glyph is used instead of
 * an unrelated product photo or emoji.
 */
export function CategoryCover({
  src,
  name,
  variant = 'thumb',
}: {
  src: string | null;
  name: string;
  variant?: 'thumb' | 'feature';
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center bg-surface-2 text-fg-muted ${
          variant === 'feature'
            ? 'aspect-[4/3] w-full rounded-card'
            : 'size-10 rounded-control'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth={1.5}
          stroke="currentColor"
          className={variant === 'feature' ? 'size-8' : 'size-5'}
        >
          <rect x="3.75" y="3.75" width="7" height="7" rx="1.5" />
          <rect x="13.25" y="3.75" width="7" height="7" rx="1.5" />
          <rect x="3.75" y="13.25" width="7" height="7" rx="1.5" />
          <rect x="13.25" y="13.25" width="7" height="7" rx="1.5" />
        </svg>
      </span>
    );
  }

  return (
    <span
      className={`relative block shrink-0 overflow-hidden bg-plate ${
        variant === 'feature'
          ? 'aspect-[4/3] w-full rounded-card'
          : 'size-10 rounded-control'
      }`}
    >
      <Image
        src={src}
        alt=""
        data-category={name}
        fill
        sizes={variant === 'feature' ? '18rem' : '40px'}
        onError={() => setFailed(true)}
        className={variant === 'feature' ? 'object-contain p-4' : 'object-contain p-1'}
      />
    </span>
  );
}
