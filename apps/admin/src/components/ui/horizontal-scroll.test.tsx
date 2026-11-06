// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HorizontalScroll } from './horizontal-scroll'

/**
 * SS-266: the mirrored top scrollbar syncs through rAF-coalesced passive
 * scroll listeners. jsdom has no layout, so scrollWidth/clientWidth are
 * mocked to force the overflowing state; scrollLeft values stay positive
 * (jsdom does not model RTL negative ranges) and scroll events are
 * dispatched explicitly — pinning the element→element sync contract that the
 * in-app browser cannot demonstrate live (it does not dispatch scroll
 * events at all).
 */

const realClientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
const realScrollWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth')

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  Object.defineProperty(Element.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return 500
    },
  })
  Object.defineProperty(Element.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return 1500
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (realClientWidth) {
    Object.defineProperty(Element.prototype, 'clientWidth', realClientWidth)
  }
  if (realScrollWidth) {
    Object.defineProperty(Element.prototype, 'scrollWidth', realScrollWidth)
  }
})

function renderScroll(): { topBar: HTMLElement; body: HTMLElement } {
  const { container } = render(
    <HorizontalScroll>
      <table>
        <tbody>
          <tr>
            <td>مقدار</td>
          </tr>
        </tbody>
      </table>
    </HorizontalScroll>,
  )
  const topBar = container.querySelector('div[aria-hidden="true"]') as HTMLElement
  const body = container.querySelector(
    'div[aria-label="ناحیه اسکرول افقی جدول"]',
  ) as HTMLElement
  return { topBar, body }
}

describe('HorizontalScroll (SS-266)', () => {
  it('renders the mirrored top bar only while overflowing, sized to the content', () => {
    const { topBar, body } = renderScroll()
    expect(topBar).toBeTruthy()
    const spacer = topBar.firstElementChild as HTMLElement
    expect(spacer.style.width).toBe('1500px')
    // The body scroller is the keyboard-reachable scroller.
    expect(body.getAttribute('tabindex')).toBe('0')
  })

  it('syncs the top bar when the body scrolls (rAF-coalesced, passive)', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame')
    const { topBar, body } = renderScroll()

    body.scrollLeft = 300
    body.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(topBar.scrollLeft).toBe(300))
    // The sync is rAF-coalesced, not written inline in the scroll handler.
    expect(rafSpy).toHaveBeenCalled()
  })

  it('syncs the body when the top bar is dragged instead', async () => {
    const { topBar, body } = renderScroll()

    topBar.scrollLeft = 120
    topBar.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(body.scrollLeft).toBe(120))
  })
})
