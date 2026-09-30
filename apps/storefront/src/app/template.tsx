import type { ReactNode } from 'react';

/**
 * App Router template (SS-246): remounts on every navigation, so one class
 * gives each route a soft fade-up entrance — the no-JS page transition.
 * The global reduced-motion rule collapses the animation to instantaneous.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
