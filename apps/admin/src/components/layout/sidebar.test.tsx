// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './sidebar'

function renderSidebar(mobileOpen: boolean) {
  return render(
    <MemoryRouter initialEntries={['/merchandising']}>
      <Sidebar
        collapsed={false}
        onToggleCollapsed={() => {}}
        mobileOpen={mobileOpen}
        onCloseMobile={() => {}}
        isAdmin={false}
      />
    </MemoryRouter>,
  )
}

describe('Sidebar merchandising navigation (SS-273)', () => {
  afterEach(cleanup)

  it('shows the single merchandising entry in the desktop and mobile navigation', async () => {
    renderSidebar(true)

    expect(screen.getByRole('link', { name: 'بازاریابی' })).toBeTruthy()
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(
      within(screen.getByRole('dialog')).getByRole('link', {
        name: 'بازاریابی',
      }),
    ).toBeTruthy()
  })

  it('still hides ADMIN-only entries from OPERATOR in the mobile drawer', async () => {
    renderSidebar(true)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    const drawer = within(screen.getByRole('dialog'))
    expect(drawer.queryByRole('link', { name: 'نقش‌ها' })).toBeNull()
    expect(drawer.queryByRole('link', { name: 'انبارها' })).toBeNull()
  })
})
