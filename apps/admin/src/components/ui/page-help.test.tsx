// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from './page-header'
import { PageHelp } from './page-help'
import { resolveRouteHelp, ROUTE_HELP } from '../../lib/route-help'

/**
 * SS-269: PageHeader resolves route help from the registry automatically
 * (trigger icon + side panel); resolveRouteHelp matches dynamic `:param`
 * patterns and normalizes trailing slashes.
 */
describe('route-help registry (SS-269)', () => {
  it('covers every nav route with an entry', () => {
    for (const key of Object.keys(ROUTE_HELP)) {
      const help = ROUTE_HELP[key]!
      expect(help.summary.length).toBeGreaterThan(10)
      expect(Array.isArray(help.sections)).toBe(true)
    }
  })

  it('matches dynamic :param segments and trims trailing slashes', () => {
    expect(resolveRouteHelp('/orders')?.title).toBe('سفارش‌ها')
    expect(resolveRouteHelp('/orders/42')?.title).toBe('جزئیات سفارش')
    expect(resolveRouteHelp('/products/')?.title).toBe('شبکه کاتالوگ')
    expect(resolveRouteHelp('/inventory/variants/abc-def')?.title).toBe('موجودی واریانت')
    expect(resolveRouteHelp('/nope')).toBeNull()
  })
})

describe('PageHeader help wiring (SS-269)', () => {
  afterEach(cleanup)

  it('renders the help trigger on a registry route and opens the side panel', async () => {
    render(
      <MemoryRouter initialEntries={['/products']}>
        <PageHeader title="محصولات" />
      </MemoryRouter>,
    )
    const trigger = screen.getByLabelText('راهنمای این صفحه')
    expect(trigger).toBeTruthy()
    // Panel content is closed until requested.
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('شبکه کاتالوگ')
    expect(dialog.textContent).toContain('ذخیره دسته‌ای')
    // Esc (Headless) / close button dismisses.
    fireEvent.click(screen.getByLabelText('بستن راهنما'))
    // The leave transition keeps the panel mounted briefly in jsdom.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('renders no trigger on a route without registry help', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <PageHeader title="ورود" />
      </MemoryRouter>,
    )
    expect(screen.queryByLabelText('راهنمای این صفحه')).toBeNull()
  })
})

describe('PageHelp panel (SS-269)', () => {
  afterEach(cleanup)

  it('renders summary, sections and workflows from the entry', () => {
    const help = ROUTE_HELP['/products']!
    render(<PageHelp help={help} open onClose={() => {}} />)
    expect(screen.getByRole('dialog').textContent).toContain('گردش کار')
    expect(screen.getAllByText('ذخیره دسته‌ای و نسخه‌ها').length).toBeGreaterThan(0)
  })

  it('reports the open state via onClose callback wiring', () => {
    const onClose = vi.fn()
    render(<PageHelp help={ROUTE_HELP['/roles']!} open onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('بستن راهنما'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
