// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HomepageDraftSection } from '@sabz/types'
import { HomepageSectionAccordion } from './homepage-section-accordion'

const sections: HomepageDraftSection[] = [
  {
    key: 'trust-main',
    type: 'TRUST_STRIP',
    order: 0,
    isVisible: true,
    settings: { items: [] },
  },
  {
    key: 'ready-main',
    type: 'READY_TO_SHIP',
    order: 1,
    isVisible: true,
    settings: { limit: 4 },
  },
]

function ControlledAccordion() {
  const [selectedKey, setSelectedKey] = useState<string | null>('trust-main')
  return (
    <HomepageSectionAccordion
      sections={sections}
      selectedKey={selectedKey}
      validation={null}
      maxSections={12}
      onSelect={setSelectedKey}
      onDeselect={() => setSelectedKey(null)}
      onAdd={() => null}
      onMove={() => {}}
      onRemove={() => {}}
      onToggleVisibility={() => {}}
      renderConfig={(section) => (
        <p>تنظیمات {section.type}</p>
      )}
    />
  )
}

describe('HomepageSectionAccordion', () => {
  afterEach(cleanup)

  it('keeps one selected region in the DOM and exposes it from the active header', () => {
    render(<ControlledAccordion />)

    const headers = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[data-accordion-header]'),
    )
    expect(headers).toHaveLength(2)
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('false')
    expect(headers[0]!.getAttribute('aria-controls')).toBe(
      'homepage-accordion-panel-trust-main',
    )
    expect(headers[1]!.getAttribute('aria-controls')).toBeNull()

    const trustPanel = document.getElementById(
      'homepage-accordion-panel-trust-main',
    ) as HTMLElement
    expect(trustPanel.getAttribute('role')).toBe('region')
    expect(trustPanel.getAttribute('aria-labelledby')).toBe(
      headers[0]!.getAttribute('id'),
    )
    expect(document.querySelectorAll('[role="region"]')).toHaveLength(1)
    expect(screen.getByText('تنظیمات TRUST_STRIP')).toBeTruthy()
    expect(screen.queryByText('تنظیمات READY_TO_SHIP')).toBeNull()

    fireEvent.click(headers[1]!)
    expect(headers[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('true')
    expect(headers[1]!.getAttribute('aria-controls')).toBe(
      'homepage-accordion-panel-ready-main',
    )
    expect(document.getElementById('homepage-accordion-panel-trust-main')).toBeNull()
    expect(screen.getByText('تنظیمات READY_TO_SHIP')).toBeTruthy()
    expect(document.querySelectorAll('[role="region"]')).toHaveLength(1)

    fireEvent.click(headers[1]!)
    expect(headers[1]!.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[role="region"]')).toBeNull()
  })

  it('uses an in-flow two-column desktop layout with one configuration pane', () => {
    render(<ControlledAccordion />)

    const pane = document.querySelector(
      '[data-homepage-config-pane]',
    ) as HTMLElement
    expect(pane).toBeTruthy()
    expect(document.querySelectorAll('[data-homepage-config-pane]')).toHaveLength(
      1,
    )
    expect(pane.className).toContain('lg:col-start-2')
    expect(pane.className).toContain('lg:sticky')
    expect(pane.className).not.toContain('absolute')

    const panel = document.getElementById('homepage-accordion-panel-trust-main')!
    expect(pane.contains(panel)).toBe(true)

    const grid = pane.parentElement as HTMLElement
    expect(grid.className).toContain('lg:grid')
    expect(grid.className).toContain('lg:grid-cols-[22rem_minmax(0,1fr)]')
  })

  it('keeps the same config child mounted when the layout switches', () => {
    function StatefulConfig() {
      const [value, setValue] = useState('')
      return (
        <input
          aria-label="آزمون وضعیت"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      )
    }

    function LayoutHarness({ desktop }: { desktop: boolean }) {
      return (
        <HomepageSectionAccordion
          sections={sections}
          selectedKey="trust-main"
          validation={null}
          maxSections={12}
          desktop={desktop}
          onSelect={() => {}}
          onAdd={() => null}
          onMove={() => {}}
          onRemove={() => {}}
          onToggleVisibility={() => {}}
          renderConfig={() => <StatefulConfig />}
        />
      )
    }

    const { rerender } = render(<LayoutHarness desktop />)
    const input = screen.getByLabelText('آزمون وضعیت') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'پایدار' } })
    input.focus()

    rerender(<LayoutHarness desktop={false} />)
    expect(screen.getByLabelText('آزمون وضعیت')).toBe(input)
    expect((screen.getByLabelText('آزمون وضعیت') as HTMLInputElement).value).toBe(
      'پایدار',
    )
    expect(document.activeElement).toBe(input)

    rerender(<LayoutHarness desktop />)
    expect(screen.getByLabelText('آزمون وضعیت')).toBe(input)
    expect((screen.getByLabelText('آزمون وضعیت') as HTMLInputElement).value).toBe(
      'پایدار',
    )
  })

  it('focuses the add control after the last section is removed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    function RemovalHarness() {
      const [items, setItems] = useState([sections[0]!])
      return (
        <HomepageSectionAccordion
          sections={items}
          selectedKey={null}
          validation={null}
          maxSections={12}
          onSelect={() => {}}
          onAdd={() => null}
          onMove={() => {}}
          onRemove={() => setItems([])}
          onToggleVisibility={() => {}}
          renderConfig={() => null}
        />
      )
    }

    render(<RemovalHarness />)
    fireEvent.click(
      screen.getByRole('button', { name: 'حذف بخش نوار اعتماد' }),
    )

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'افزودن بخش' }),
      ),
    )
    vi.restoreAllMocks()
  })

  it('keeps move, remove, visibility, and add controls reachable', () => {
    const onMove = vi.fn()
    const onToggle = vi.fn()
    const onAdd = vi.fn(() => null)
    render(
      <HomepageSectionAccordion
        sections={sections}
        selectedKey={null}
        validation={null}
        maxSections={12}
        onSelect={() => {}}
        onAdd={onAdd}
        onMove={onMove}
        onRemove={() => {}}
        onToggleVisibility={onToggle}
        renderConfig={() => null}
      />,
    )

    fireEvent.change(screen.getByLabelText('افزودن بخش'), {
      target: { value: 'TRUST_STRIP' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))
    expect(onAdd).toHaveBeenCalledWith('TRUST_STRIP')

    fireEvent.click(screen.getByLabelText('نمایش بخش نوار اعتماد'))
    expect(onToggle).toHaveBeenCalledWith(0)

    fireEvent.click(
      screen.getByRole('button', { name: 'جابه‌جایی نوار اعتماد به پایین' }),
    )
    expect(onMove).toHaveBeenCalledWith(0, 1)
  })
})
