// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CampaignOrderedEntityList } from './campaign-ordered-entity-list'

describe('CampaignOrderedEntityList (SS-275)', () => {
  afterEach(cleanup)

  it('exposes accessible move and remove controls and preserves callback ids', () => {
    const onMove = vi.fn()
    const onRemove = vi.fn()
    render(
      <CampaignOrderedEntityList
        items={[
          { id: 'p1', label: 'محصول یک', secondary: 'product-1' },
          { id: 'p2', label: 'محصول دو', secondary: 'product-2' },
        ]}
        emptyLabel="خالی"
        onMove={onMove}
        onRemove={onRemove}
      />,
    )

    expect(
      (screen.getByRole('button', {
        name: 'جابه‌جایی محصول یک به بالا',
      }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(
      screen.getByRole('button', { name: 'جابه‌جایی محصول یک به پایین' }),
    )
    expect(onMove).toHaveBeenCalledWith('p1', 1)

    fireEvent.click(screen.getByRole('button', { name: 'حذف محصول دو' }))
    expect(onRemove).toHaveBeenCalledWith('p2')
  })

  it('keeps described-by on the empty-state wrapper', () => {
    render(
      <CampaignOrderedEntityList
        items={[]}
        emptyLabel="انتخابی وجود ندارد"
        describedBy="selection-error"
        onMove={() => {}}
        onRemove={() => {}}
      />,
    )
    expect(screen.getByText('انتخابی وجود ندارد')).toBeTruthy()
    expect(
      screen
        .getByRole('group', { name: 'فهرست خالی' })
        .getAttribute('aria-describedby'),
    ).toBe('selection-error')
  })

  it('moves focus to a surviving row after removal', async () => {
    const initial = [
      { id: 'p1', label: 'محصول یک' },
      { id: 'p2', label: 'محصول دو' },
    ]

    function ControlledList() {
      const [items, setItems] = useState(initial)
      return (
        <CampaignOrderedEntityList
          items={items}
          emptyLabel="خالی"
          onMove={() => {}}
          onRemove={(id) =>
            setItems((current) => current.filter((item) => item.id !== id))
          }
        />
      )
    }

    render(<ControlledList />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف محصول یک' }))

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'حذف محصول دو' }),
      ),
    )
  })

  it('does not drop focus to the body when the last row is removed', async () => {
    function ControlledList() {
      const [items, setItems] = useState([{ id: 'p1', label: 'محصول یک' }])
      return (
        <CampaignOrderedEntityList
          items={items}
          emptyLabel="خالی"
          onMove={() => {}}
          onRemove={() => setItems([])}
        />
      )
    }

    render(<ControlledList />)
    fireEvent.click(screen.getByRole('button', { name: 'حذف محصول یک' }))

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement?.tagName).toBe('DIV')
    })
  })
})
