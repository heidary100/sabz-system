import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useDragToScroll } from '../../hooks/use-drag-scroll'

/**
 * Horizontal scroll area with a MIRRORED TOP SCROLLBAR (SS-257 rework
 * feedback): wide tables scroll from the top of the table too, not only
 * below it. The top bar is rendered only when the content actually
 * overflows, and both bars stay in sync while either is dragged.
 *
 * SS-266 scroll-performance rework: syncing runs through manual passive
 * scroll listeners coalesced in one requestAnimationFrame (React synthetic
 * `onScroll` handlers replaced), ResizeObserver callbacks are rAF-coalesced,
 * the body scroller is keyboard-focusable (arrow keys scroll it natively),
 * and an opt-in mouse drag-to-pan is available via `dragToPan`.
 */
export function HorizontalScroll({
  children,
  className,
  dragToPan = false,
}: {
  children: ReactNode
  className?: string
  dragToPan?: boolean
}) {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(0)
  const [overflowing, setOverflowing] = useState(false)

  useDragToScroll(bodyRef, dragToPan)

  useEffect(() => {
    const content = contentRef.current
    const body = bodyRef.current
    if (!content || !body) {
      return
    }
    const measureFrame = { current: 0 }
    const measure = (): void => {
      const nextWidth = content.scrollWidth
      const nextViewport = body.clientWidth
      setContentWidth(nextWidth)
      setOverflowing(nextWidth > nextViewport && nextViewport > 0)
    }
    const scheduleMeasure = (): void => {
      if (measureFrame.current) {
        return
      }
      measureFrame.current = requestAnimationFrame(() => {
        measureFrame.current = 0
        measure()
      })
    }
    measure()
    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(content)
    observer.observe(body)
    return () => {
      observer.disconnect()
      if (measureFrame.current) {
        cancelAnimationFrame(measureFrame.current)
      }
    }
  }, [])

  // Re-attached when the top bar mounts/unmounts (it only exists while
  // overflowing), so its listener always lands on a live element.
  useEffect(() => {
    const top = topRef.current
    const body = bodyRef.current
    if (!top || !body) {
      return
    }
    const syncFrame = { current: 0 }
    const leader = { current: body }
    const flush = (): void => {
      syncFrame.current = 0
      const follower = leader.current === top ? body : top
      // A no-op write fires no scroll event, so this cannot loop.
      if (follower.scrollLeft !== leader.current.scrollLeft) {
        follower.scrollLeft = leader.current.scrollLeft
      }
    }
    const scheduleSync = (source: HTMLDivElement): void => {
      leader.current = source
      if (!syncFrame.current) {
        syncFrame.current = requestAnimationFrame(flush)
      }
    }
    const onTopScroll = (): void => scheduleSync(top)
    const onBodyScroll = (): void => scheduleSync(body)
    top.addEventListener('scroll', onTopScroll, { passive: true })
    body.addEventListener('scroll', onBodyScroll, { passive: true })
    return () => {
      top.removeEventListener('scroll', onTopScroll)
      body.removeEventListener('scroll', onBodyScroll)
      if (syncFrame.current) {
        cancelAnimationFrame(syncFrame.current)
      }
    }
  }, [overflowing])

  return (
    <div className={className}>
      {overflowing ? (
        <div
          ref={topRef}
          aria-hidden="true"
          className="overflow-x-auto"
        >
          {/* Same width as the table body content → a real scrollbar track. */}
          <div style={{ width: contentWidth, height: 8 }} />
        </div>
      ) : null}
      <div
        ref={bodyRef}
        className="overflow-x-auto"
        tabIndex={0}
        aria-label="ناحیه اسکرول افقی جدول"
      >
        <div ref={contentRef} className="inline-block min-w-full">
          {children}
        </div>
      </div>
    </div>
  )
}
