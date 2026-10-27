// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { SlugField, useSlugSuggestion } from './slug-field'

/**
 * SS-254 component matrix: live suggestion, manual lock, regenerate, edit
 * preservation, collision hints. The field is controlled — tests drive it
 * through a small stateful harness mirroring how the forms own state.
 */
function Harness(props: {
  initialSlug: string
  initialMode: 'auto' | 'manual'
  name: string
  onName?: (name: string) => void
  collisionHint?: string | null
  conflictMessage?: string | null
}) {
  const [name, setName] = useState(props.name)
  const field = useSlugSuggestion({
    slug: props.initialSlug,
    mode: props.initialMode,
  })
  return (
    <div>
      <input
        aria-label="نام"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
          props.onName?.(event.target.value)
        }}
      />
      <SlugField
        name={name}
        slug={field.slug}
        mode={field.mode}
        onInput={field.handleSlugInput}
        onRegenerate={field.regenerate}
        collisionHint={props.collisionHint}
        conflictMessage={props.conflictMessage}
      />
    </div>
  )
}

describe('SlugField', () => {
  afterEach(() => cleanup())

  function nameBox() {
    return screen.getByRole('textbox', { name: 'نام' })
  }
  function slugBox() {
    return screen.getByRole('textbox', { name: 'نشانی (Slug)' })
  }

  it('shows the live suggestion while typing a Persian name (auto mode)', () => {
    render(<Harness initialSlug="" initialMode="auto" name="" />)
    fireEvent.input(nameBox(), { target: { value: 'کالای دیجیتال' } })
    expect(slugBox().getAttribute('value')).toBe('kalay-dyjytal')
    expect(screen.getByText('این نشانی بر اساس نام ساخته می‌شود.')).toBeTruthy()
  })

  it('updates the suggestion when the name changes again (still auto)', () => {
    render(<Harness initialSlug="" initialMode="auto" name="" />)
    fireEvent.input(nameBox(), { target: { value: 'لپتاپ' } })
    expect(slugBox().getAttribute('value')).toBe('lptap')
    fireEvent.input(nameBox(), { target: { value: 'دل' } })
    expect(slugBox().getAttribute('value')).toBe('dl')
  })

  it('locks to manual on the first slug keystroke and preserves it across name changes', () => {
    render(<Harness initialSlug="" initialMode="auto" name="" />)
    fireEvent.input(nameBox(), { target: { value: 'لپتاپ' } })
    fireEvent.input(slugBox(), { target: { value: 'my-custom-slug' } })
    fireEvent.input(nameBox(), { target: { value: 'کالای دیجیتال' } })
    expect(slugBox().getAttribute('value')).toBe('my-custom-slug')
    expect(
      screen.getByText('نشانی به‌صورت دستی ویرایش شده و با تغییر نام بازنویسی نمی‌شود.'),
    ).toBeTruthy()
  })

  it('regenerates from the CURRENT name and resumes auto mode', () => {
    render(<Harness initialSlug="" initialMode="auto" name="" />)
    fireEvent.input(nameBox(), { target: { value: 'لپتاپ' } })
    fireEvent.input(slugBox(), { target: { value: 'manual-entry' } })
    fireEvent.input(nameBox(), { target: { value: 'دل' } })
    fireEvent.click(screen.getByRole('button', { name: 'ساخت مجدد از روی نام' }))
    expect(slugBox().getAttribute('value')).toBe('dl')
    fireEvent.input(nameBox(), { target: { value: 'لپتاپ' } })
    expect(slugBox().getAttribute('value')).toBe('lptap')
  })

  it('never rewrites a persisted slug in edit mode unless explicitly acted on', () => {
    render(
      <Harness initialSlug="imported-lossy-slug" initialMode="manual" name="نام قدیمی" />,
    )
    fireEvent.input(nameBox(), { target: { value: 'کالای دیجیتال' } })
    expect(slugBox().getAttribute('value')).toBe('imported-lossy-slug')
    // The regenerate affordance is available for an explicit change only.
    expect(screen.getByRole('button', { name: 'ساخت مجدد از روی نام' })).toBeTruthy()
  })

  it('shows the empty-name helper while auto and the name yields nothing', () => {
    render(<Harness initialSlug="" initialMode="auto" name="" />)
    expect(screen.getByText('با وارد شدن نام، نشانی ساخته می‌شود.')).toBeTruthy()
  })

  it('renders the collision hint and keeps it distinct from the empty case', () => {
    render(
      <Harness
        initialSlug=""
        initialMode="auto"
        name="لپتاپ"
        collisionHint="این نشانی قبلاً استفاده شده است."
      />,
    )
    expect(screen.getByText(/این نشانی قبلاً استفاده شده است/)).toBeTruthy()
  })

  it('renders a field-level conflict message when given one', () => {
    render(
      <Harness
        initialSlug="taken"
        initialMode="manual"
        name="X"
        conflictMessage="یک برند با این slug قبلاً وجود دارد."
      />,
    )
    expect(screen.getByText('یک برند با این slug قبلاً وجود دارد.')).toBeTruthy()
    // Input and mode survive (the manual value is still displayed).
    expect(slugBox().getAttribute('value')).toBe('taken')
  })
})
