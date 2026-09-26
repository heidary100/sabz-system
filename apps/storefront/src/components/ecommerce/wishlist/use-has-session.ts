import { useSyncExternalStore } from 'react';
import { hasSession } from '@/lib/auth-client';

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

/**
 * Client session visibility (SS-231): reads the localStorage token through
 * `useSyncExternalStore` so server/first-paint render `false` (no hydration
 * mismatch) and logged-in clients flip to `true` without a
 * set-state-in-effect. Cross-tab login/logout also propagates via the
 * `storage` event.
 */
export function useHasSession(): boolean {
  return useSyncExternalStore(subscribe, hasSession, () => false);
}
