// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomepageUnsavedChangesDialog } from './homepage-unsaved-changes-dialog'

describe('HomepageUnsavedChangesDialog', () => {
  afterEach(cleanup)

  it('has an accessible title, description, and explicit actions', () => {
    const onStay = vi.fn()
    const onLeave = vi.fn()
    render(
      <HomepageUnsavedChangesDialog
        open
        onStay={onStay}
        onLeave={onLeave}
      />,
    )

    const dialog = screen.getByRole('dialog')
    expect(
      screen.getByRole('heading', { name: 'تغییرات ذخیره‌نشده' }),
    ).toBeTruthy()
    expect(dialog.textContent).toContain('بدون ذخیره از این صفحه خارج می‌شوید')

    fireEvent.click(screen.getByRole('button', { name: 'ماندن در ویرایشگر' }))
    expect(onStay).toHaveBeenCalledOnce()
    expect(onLeave).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'خروج بدون ذخیره' }))
    expect(onLeave).toHaveBeenCalledOnce()
  })
})
