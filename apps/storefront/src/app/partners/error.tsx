'use client';

import { RouteErrorState } from '@/components/ecommerce/error/route-error-state';

/** Route-level error boundary (SS-230B): friendly Persian retry state. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState error={error} reset={reset} />;
}
