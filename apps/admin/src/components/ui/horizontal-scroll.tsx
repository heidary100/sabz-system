import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Horizontal scroll area with a MIRRORED TOP SCROLLBAR (SS-257 rework
 * feedback): wide tables scroll from the top of the table too, not only
 * below it. The top bar is rendered only when the content actually
 * overflows, and both bars stay in sync while either is dragged.
 */
export function HorizontalScroll({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const topRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const syncingRef = useRef(false)
  const [contentWidth, setContentWidth] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const content = contentRef.current
    const body = bodyRef.current
    if (!content || !body) {
      return
    }
    const measure = (): void => {
      setContentWidth(content.scrollWidth)
      setViewportWidth(body.clientWidth)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  const overflowing = contentWidth > viewportWidth && viewportWidth > 0

  const syncFrom = (source: HTMLDivElement | null, target: HTMLDivElement | null): void => {
    if (!source || !target || syncingRef.current) {
      return
    }
    syncingRef.current = true
    target.scrollLeft = source.scrollLeft
    syncingRef.current = false
  }

  return (
    <div className={className}>
      {overflowing ? (
        <div
          ref={topRef}
          aria-hidden="true"
          className="overflow-x-auto"
          onScroll={() => syncFrom(topRef.current, bodyRef.current)}
        >
          {/* Same width as the table body content → a real scrollbar track. */}
          <div style={{ width: contentWidth, height: 8 }} />
        </div>
      ) : null}
      <div
        ref={bodyRef}
        className="overflow-x-auto"
        onScroll={() => syncFrom(bodyRef.current, topRef.current)}
      >
        <div ref={contentRef} className="inline-block min-w-full">
          {children}
        </div>
      </div>
    </div>
  )
}
