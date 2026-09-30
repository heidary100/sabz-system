'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Mounted-while-transitioning (SS-246): keeps a dialog/drawer mounted long
 * enough for its CSS exit animation to play, then unmounts for real.
 *
 * Returns [shouldRender, state] where `state` is 'open' after the entrance
 * frame and 'closed' while the exit animation runs — drive `data-state` on
 * the animated wrapper with it (the .drawer-panel/.sheet-panel classes in
 * globals.css select the enter/exit keyframes from it).
 *
 * Reduced motion: the global kill-switch collapses animation durations to
 * ~0, and the timeout uses the same EXIT_MS, so unmount stays effectively
 * instant. Callers pass EXIT_MS so the constant stays in one place.
 */
export const TRANSITION_EXIT_MS = 300;

export function useTransitionMount(
  open: boolean,
  exitMs: number = TRANSITION_EXIT_MS,
): [boolean, 'open' | 'closed'] {
  const [shouldRender, setShouldRender] = useState(open);
  const [state, setState] = useState<'open' | 'closed'>(open ? 'open' : 'closed');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (open) {
      // Render-state sync from the owning dialog's prop — intentional
      // external sync, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldRender(true);
      // Double rAF keeps the initial (closed → open) frame observable so
      // the enter animation plays instead of snapping.
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setState('open'));
      });
      return () => cancelAnimationFrame(raf);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState('closed');
    timerRef.current = setTimeout(() => setShouldRender(false), exitMs);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, exitMs]);

  return [shouldRender, state];
}
