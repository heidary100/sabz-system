import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Elements the drag-to-pan gesture must never hijack (SS-266 guard rules). */
const INTERACTIVE_SELECTOR =
  'input, select, textarea, button, a, label, [role="listbox"], [role="option"], [aria-haspopup]'

/** Horizontal movement (px) before a press becomes a pan instead of a click. */
const DRAG_THRESHOLD_PX = 6

/** Window (ms) after a real drag during which the trailing click is swallowed. */
const CLICK_SUPPRESS_MS = 150

/**
 * Mouse drag-to-pan for a horizontally scrollable container (SS-266).
 *
 * Guard rules — normal table interactions always win over panning:
 * - Mouse only: `pointerType !== 'mouse'` never activates (touch/trackpad
 *   keep their native scrolling).
 * - Never starts on inputs, selects, buttons, links, labels, listboxes or
 *   anything with a popup (the `INTERACTIVE_SELECTOR` guard).
 * - Activates only after `DRAG_THRESHOLD_PX` of horizontal movement, so a
 *   plain click is unaffected.
 * - Pans via `scrollBy({ left: -dx })`, which is direction-agnostic under
 *   RTL (no negative-`scrollLeft` math).
 * - Text selection is disabled only while a drag is actually running.
 * - The click that follows a real drag is swallowed once; plain clicks pass.
 * - Cursor (`grab`/`grabbing`) is set through inline styles so React
 *   re-renders cannot wipe it.
 */
export function useDragToScroll(
  target: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    const el = target.current
    if (!el || !enabled) {
      return
    }

    let pointerId: number | null = null
    let startX = 0
    let lastX = 0
    let dragging = false
    let dragEndedAt = -Infinity

    const suppressClick = (event: MouseEvent): void => {
      // One-shot by click: the first click after a drag is evaluated (and,
      // within the window, swallowed); later clicks always pass through.
      el.removeEventListener('click', suppressClick, { capture: true })
      if (performance.now() - dragEndedAt < CLICK_SUPPRESS_MS) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || pointerId !== null) {
        return
      }
      const origin = event.target instanceof Element ? event.target : null
      if (origin?.closest(INTERACTIVE_SELECTOR)) {
        return
      }
      pointerId = event.pointerId
      startX = event.clientX
      lastX = event.clientX
      dragging = false
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return
      }
      if (!dragging) {
        if (Math.abs(event.clientX - startX) < DRAG_THRESHOLD_PX) {
          return
        }
        dragging = true
        el.style.userSelect = 'none'
        el.style.cursor = 'grabbing'
        try {
          el.setPointerCapture(event.pointerId)
        } catch {
          // Capture is best-effort; panning still works inside the element.
        }
      }
      const dx = event.clientX - lastX
      lastX = event.clientX
      if (dx !== 0) {
        el.scrollBy({ left: -dx })
      }
    }

    const endDrag = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return
      }
      pointerId = null
      if (dragging) {
        dragging = false
        dragEndedAt = performance.now()
        el.style.userSelect = ''
        el.style.cursor = 'grab'
        // The browser fires the click right after pointerup; swallow it once.
        el.addEventListener('click', suppressClick, { capture: true })
        window.setTimeout(() => {
          el.removeEventListener('click', suppressClick, { capture: true })
        }, CLICK_SUPPRESS_MS * 2)
      }
    }

    el.style.cursor = 'grab'
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endDrag)
    el.addEventListener('pointercancel', endDrag)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endDrag)
      el.removeEventListener('pointercancel', endDrag)
      el.removeEventListener('click', suppressClick, { capture: true })
      el.style.cursor = ''
      el.style.userSelect = ''
    }
  }, [target, enabled])
}
