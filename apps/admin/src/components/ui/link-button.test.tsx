// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LinkButton } from './link-button'

describe('LinkButton', () => {
  afterEach(cleanup)

  it('renders one router link with Catalyst button styling and no nested button', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <LinkButton to="/destination" color="primary">
                رفتن به مقصد
              </LinkButton>
            }
          />
          <Route path="/destination" element={<p>مقصد</p>} />
        </Routes>
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'رفتن به مقصد' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/destination')
    expect(link.className).toContain('inline-flex')
    expect(link.className).toContain('bg-(--btn-border)')
    expect(link.className).toContain('focus-ring')
    expect(link.className).toContain('focus-visible:outline-2!')
    expect(screen.queryByRole('button', { name: 'رفتن به مقصد' })).toBeNull()

    fireEvent.click(link)
    expect(screen.getByText('مقصد')).toBeTruthy()
  })
})
