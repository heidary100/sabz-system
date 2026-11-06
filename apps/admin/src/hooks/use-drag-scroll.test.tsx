// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useDragToScroll } from './use-drag-scroll'

/**
 * SS-266 drag-to-pan guard rules: mouse-only, threshold-gated, never starts
 * on interactive elements, RTL-safe scrollBy panning, and the trailing click
 * after a real drag is swallowed exactly once.
 */

function Harness({ enabled = true, withButton = false }: { enabled?: boolean; withButton?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useDragToScroll(ref, enabled)
  return (
    <div ref={ref} data-testid="scroller">
      {withButton ? (
        <button type="button" data-testid="inner">
          دکمه
        </button>
      ) : (
        <span data-testid="inner">متن</span>
      )}
    </div>
  )
}

type PointerInit = { pointerId?: number; clientX?: number; button?: number; pointerType?: string }

/** jsdom has no PointerEvent; a plain Event with assigned props is enough. */
function firePointer(element: Element, type: string, init: PointerInit = {}): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: 1, button: 0, pointerType: 'mouse', ...init })
  fireEvent(element, event as unknown as PointerEvent)
}

function scroller(): HTMLElement {
  return document.querySelector('[data-testid="scroller"]') as HTMLElement
}

beforeEach(() => {
  // jsdom does not implement element scrollBy; emulate the physical scroll.
  // (Cast: the DOM lib types two overloads; the test only uses the object form.)
  Element.prototype.scrollBy = function (this: HTMLElement, arg: ScrollToOptions): void {
    this.scrollLeft += arg.left ?? 0
  } as typeof Element.prototype.scrollBy
})

afterEach(() => {
  delete (Element.prototype as unknown as { scrollBy?: unknown }).scrollBy
  cleanup()
})

describe('useDragToScroll (SS-266)', () => {
  it('pans once past the 6px threshold, content following the mouse', () => {
    render(<Harness />)
    const el = scroller()
    firePointer(el, 'pointerdown', { clientX: 100 })
    firePointer(el, 'pointermove', { clientX: 93 }) // -7px → pan
    firePointer(el, 'pointermove', { clientX: 83 }) // -10px more
    expect(el.scrollLeft).toBe(17)
  })

  it('ignores movement below the threshold (plain click stays a click)', () => {
    render(<Harness />)
    const el = scroller()
    firePointer(el, 'pointerdown', { clientX: 100 })
    firePointer(el, 'pointermove', { clientX: 97 }) // 3px < threshold
    expect(el.scrollLeft).toBe(0)
    firePointer(el, 'pointermove', { clientX: 80 }) // 20px total → pan starts
    expect(el.scrollLeft).toBe(20)
  })

  it('never activates for non-mouse pointers (touch stays native)', () => {
    render(<Harness />)
    const el = scroller()
    firePointer(el, 'pointerdown', { clientX: 100, pointerType: 'touch' })
    firePointer(el, 'pointermove', { clientX: 40 })
    expect(el.scrollLeft).toBe(0)
  })

  it('never starts on interactive children (button/label/listbox guard)', () => {
    render(<Harness withButton />)
    const el = scroller()
    const inner = document.querySelector('[data-testid="inner"]') as HTMLElement
    firePointer(inner, 'pointerdown', { clientX: 100 })
    firePointer(el, 'pointermove', { clientX: 40 })
    expect(el.scrollLeft).toBe(0)
  })

  it('does not pan when disabled', () => {
    render(<Harness enabled={false} />)
    const el = scroller()
    firePointer(el, 'pointerdown', { clientX: 100 })
    firePointer(el, 'pointermove', { clientX: 40 })
    expect(el.scrollLeft).toBe(0)
  })

  it('a plain click (no drag) is NOT suppressed', () => {
    render(<Harness />)
    const el = scroller()
    const inner = document.querySelector('[data-testid="inner"]') as HTMLElement
    firePointer(el, 'pointerdown', { clientX: 100 })
    firePointer(el, 'pointerup', { clientX: 100 })
    const clicked = vi.fn()
    inner.addEventListener('click', clicked)
    fireEvent.click(inner)
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('the click right after a real drag is swallowed exactly once', () => {
    render(<Harness />)
    const el = scroller()
    const inner = document.querySelector('[data-testid="inner"]') as HTMLElement
    firePointer(el, 'pointerdown', { clientX: 100 })
    firePointer(el, 'pointermove', { clientX: 40 }) // real drag
    firePointer(el, 'pointerup', { clientX: 40 })
    const clicked = vi.fn()
    inner.addEventListener('click', clicked)
    const event = new Event('click', { bubbles: true, cancelable: true })
    fireEvent(el, event)
    expect(clicked).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
    // The suppression is one-shot: a later click passes through.
    fireEvent.click(inner)
    expect(clicked).toHaveBeenCalledTimes(1)
  })
})
