// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

  it('renders the empty label', () => {
    render(
      <CampaignOrderedEntityList
        items={[]}
        emptyLabel="انتخابی وجود ندارد"
        onMove={() => {}}
        onRemove={() => {}}
      />,
    )
    expect(screen.getByText('انتخابی وجود ندارد')).toBeTruthy()
  })
})
