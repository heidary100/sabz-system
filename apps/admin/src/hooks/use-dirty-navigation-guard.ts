import { useEffect } from 'react'

export const UNSAVED_DRAFT_MESSAGE =
  'تغییرات ذخیره‌نشده دارید؛ بدون ذخیره از این صفحه خارج می‌شوید؟'

/**
 * Guards browser refresh/close and in-app anchor navigation while a document
 * has unsaved changes. The app uses BrowserRouter (not a data router), so a
 * capture-phase anchor guard is used instead of useBlocker.
 */
export function useDirtyNavigationGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) {
      return
    }

    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }

    const onClick = (event: MouseEvent): void => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.dataset.ignoreUnsavedGuard !== undefined
      ) {
        return
      }
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) {
        return
      }
      if (!window.confirm(UNSAVED_DRAFT_MESSAGE)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
      }
    }

    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])
}
