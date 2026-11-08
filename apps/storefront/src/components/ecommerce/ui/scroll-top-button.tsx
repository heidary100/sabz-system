'use client';

import { useEffect, useState } from 'react';

/**
 * Scroll-to-top control (SS-224), parity with the live site. Appears after
 * the first viewport of scrolling; smooth scroll respects reduced-motion.
 */
export function ScrollTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      className="animate-fade-up fixed bottom-6 end-6 z-30 inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-stage text-on-stage shadow-lift transition-colors hover:bg-stage-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span className="sr-only">بازگشت به بالای صفحه</span>
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
        <path d="M4.5 15.75l7.5-7.5 7.5 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
