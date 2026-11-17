import type { ReactNode } from 'react';

/**
 * App Router template. The former page-wide fade-up entrance was removed:
 * no content may depend on an entrance animation to become visible, and
 * per-route motion is reserved for the hero campaign rather than every page.
 */
export default function Template({ children }: { children: ReactNode }) {
  return children;
}
