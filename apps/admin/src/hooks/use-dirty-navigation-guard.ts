import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'

export const UNSAVED_DRAFT_MESSAGE =
  'تغییرات ذخیره‌نشده دارید؛ بدون ذخیره از این صفحه خارج می‌شوید؟'

export interface DirtyNavigationGuard {
  /** True while a navigation attempt is waiting for confirmation. */
  blocked: boolean
  /** Continue the blocked navigation to its exact destination. */
  proceed: () => void
  /** Stay on the current route and discard the blocked navigation. */
  reset: () => void
  /**
   * Allow the next programmatic navigation without a prompt. Used when an
   * action has already committed the draft and must move to the result page.
   */
  allowNextNavigation: () => void
}

/**
 * Blocks SPA navigation, including browser Back/Forward, while a draft has
 * unsaved changes. React Router's data-router blocker restores POP navigation
 * itself and preserves the requested destination, so no manual history
 * manipulation is required.
 *
 * Document unloads (refresh, tab close, cross-origin navigation via a plain
 * anchor) remain protected by `beforeunload`, which browsers own.
 */
export function useDirtyNavigationGuard(dirty: boolean): DirtyNavigationGuard {
  const bypassRef = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypassRef.current) {
      bypassRef.current = false
      return false
    }
    if (!dirty) {
      return false
    }
    // Same-location hash/link clicks are not leaving the draft.
    return (
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search ||
      currentLocation.hash !== nextLocation.hash
    )
  })

  useEffect(() => {
    if (!dirty) {
      return
    }
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])

  // A successful save turns the blocker off. If a confirmation was open, close
  // it and cancel the pending navigation so the clean editor keeps its route.
  useEffect(() => {
    if (!dirty && blocker.state === 'blocked') {
      blocker.reset()
    }
  }, [dirty, blocker])

  return {
    blocked: blocker.state === 'blocked',
    proceed: () => {
      if (blocker.state === 'blocked') {
        blocker.proceed()
      }
    },
    reset: () => {
      if (blocker.state === 'blocked') {
        blocker.reset()
      }
    },
    allowNextNavigation: () => {
      bypassRef.current = true
    },
  }
}
