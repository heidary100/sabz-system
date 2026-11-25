/**
 * Same-tab authentication signal. The native `storage` event only fires in
 * other tabs, so token writes dispatch this event for useSyncExternalStore
 * consumers in the current tab.
 */
export const AUTH_STATE_EVENT = 'sabz:auth-state';
