// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { MerchTabs } from './merch-tabs'

describe('MerchTabs', () => {
  afterEach(cleanup)

  it('exposes shared focus and 44px touch target classes on every tab', () => {
    render(
      <MemoryRouter initialEntries={['/merchandising/campaigns']}>
        <MerchTabs />
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'بخش‌های بازاریابی' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(5)
    for (const link of links) {
      expect(link.className).toContain('focus-ring')
      expect(link.className).toContain('min-h-11')
    }
    expect(
      within(nav)
        .getByRole('link', { name: 'کمپین‌ها' })
        .getAttribute('aria-current'),
    ).toBe('page')
  })
})
