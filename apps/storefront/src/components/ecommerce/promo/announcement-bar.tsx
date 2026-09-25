'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AnnouncementConfig } from '@/config/home';

/**
 * Store-wide announcement bar (SS-215). Rendered only when the home config
 * carries an announcement — with the safe defaults the page omits it
 * entirely and this component never mounts.
 *
 * Non-sticky single line; dismissal is local component state (no
 * localStorage, no persistence). The `href` is pre-validated by
 * `resolveAnnouncement`, so a present link always targets a real route.
 */
export function AnnouncementBar({
  announcement,
}: {
  announcement: AnnouncementConfig;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="اطلاعیه فروشگاه"
      className="bg-sabz-800 text-white"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <p className="min-w-0 flex-1 truncate text-center text-[13px] leading-6">
          {announcement.href ? (
            <Link
              href={announcement.href}
              className="rounded-sm underline decoration-sabz-200 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {announcement.text}
            </Link>
          ) : (
            announcement.text
          )}
        </p>
        {announcement.dismissible ? (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="بستن اطلاعیه"
            className="inline-flex min-h-11 min-w-11 -my-2 shrink-0 items-center justify-center rounded-md text-sabz-100 hover:bg-sabz-700 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="size-4"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
