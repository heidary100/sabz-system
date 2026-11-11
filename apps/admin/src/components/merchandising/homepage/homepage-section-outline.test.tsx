// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HomepageDraftSection, HomepageDraftValidationResult } from '@sabz/types'
import { HomepageSectionOutline } from './homepage-section-outline'

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
    isVisible: false,
    settings: { limit: 4 },
  },
]

const validation: HomepageDraftValidationResult = {
  revision: 2,
  schemaVersion: 1,
  valid: false,
  errors: [
    {
      path: 'sections[0].settings.items',
      code: 'ERR',
      message: 'خطا',
      severity: 'ERROR',
      category: 'STRUCTURAL',
    },
  ],
  warnings: [
    {
      path: 'sections[1].settings.limit',
      code: 'WARN',
      message: 'هشدار',
      severity: 'WARNING',
      category: 'WARNING',
    },
  ],
}

function renderOutline(overrides: Partial<ComponentProps<typeof HomepageSectionOutline>> = {}) {
  return render(
    <HomepageSectionOutline
      sections={sections}
      selectedKey="trust-main"
      validation={validation}
      maxSections={12}
      onSelect={() => {}}
      onAdd={() => null}
      onMove={() => {}}
      onRemove={() => {}}
      onToggleVisibility={() => {}}
      {...overrides}
    />,
  )
}

describe('HomepageSectionOutline (SS-276)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('lists all nine supported types and allows campaign-backed selection-first add', () => {
    const onAdd = vi.fn(() => null)
    renderOutline({ onAdd })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(9)
    expect(screen.getByRole('option', { name: 'کاروسل هدر' })).toBeTruthy()
    expect(
      (screen.getByRole('button', {
        name: 'افزودن بخش',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)

    fireEvent.change(screen.getByLabelText('افزودن بخش'), {
      target: { value: 'CATEGORY_DISCOVERY' },
    })
    expect(
      (screen.getByRole('button', {
        name: 'افزودن بخش',
      }) as HTMLButtonElement).disabled,
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))
    expect(onAdd).toHaveBeenCalledWith('CATEGORY_DISCOVERY')
  })

  it('adds an allowed type and reports callback errors', () => {
    const onAdd = vi.fn(() => 'خطای افزودن')
    renderOutline({ onAdd })

    fireEvent.click(screen.getByRole('button', { name: 'افزودن بخش' }))
    expect(onAdd).toHaveBeenCalledWith('TRUST_STRIP')
    expect(screen.getByText('خطای افزودن')).toBeTruthy()
  })

  it('supports selection, visibility, moving, and confirmed removal', () => {
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    const onMove = vi.fn()
    const onRemove = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderOutline({ onSelect, onToggleVisibility: onToggle, onMove, onRemove })

    expect(
      screen.getByRole('button', { name: 'انتخاب بخش نوار اعتماد' }).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect(screen.getByText('۱ خطا')).toBeTruthy()
    expect(screen.getByText('۱ هشدار')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب بخش آماده ارسال' }))
    expect(onSelect).toHaveBeenCalledWith('ready-main')

    fireEvent.click(screen.getByLabelText('نمایش بخش نوار اعتماد'))
    expect(onToggle).toHaveBeenCalledWith(0)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'جابه‌جایی نوار اعتماد به پایین',
      }),
    )
    expect(onMove).toHaveBeenCalledWith(0, 1)

    fireEvent.click(
      screen.getByRole('button', { name: 'حذف بخش آماده ارسال' }),
    )
    expect(onRemove).toHaveBeenCalledWith(1)
  })

  it('moves focus to a surviving section after removal', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    function ControlledOutline() {
      const [items, setItems] = useState(sections)
      return (
        <HomepageSectionOutline
          sections={items}
          selectedKey={null}
          validation={null}
          maxSections={12}
          onSelect={() => {}}
          onAdd={() => null}
          onMove={() => {}}
          onRemove={(index) =>
            setItems((current) => current.filter((_, i) => i !== index))
          }
          onToggleVisibility={() => {}}
        />
      )
    }

    render(<ControlledOutline />)
    fireEvent.click(
      screen.getByRole('button', { name: 'حذف بخش نوار اعتماد' }),
    )

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'انتخاب بخش آماده ارسال' }),
      ),
    )
  })
})
