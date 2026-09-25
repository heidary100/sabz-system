'use client';

import { useEffect } from 'react';

/**
 * Reusable route error boundary content (SS-217): Persian-first, RTL-native
 * (inherits the document direction), factual, and retryable via `reset()`.
 * The original error is logged for diagnosis but never rendered — API error
 * payloads and internals must not leak to visitors.
 */
export function RouteErrorState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route render failed:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
      <h1 className="text-xl font-bold tracking-tight text-ink-900">
        خطا در بارگذاری صفحه
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-600">
        در دریافت اطلاعات مشکلی پیش آمد. لطفاً دوباره تلاش کنید؛ اگر مشکل
        ادامه داشت، بعداً سر بزنید.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-block rounded-md bg-sabz-700 px-6 py-3 text-sm font-semibold text-white hover:bg-sabz-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-700"
      >
        تلاش مجدد
      </button>
    </div>
  );
}
