// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDirtyNavigationGuard } from './use-dirty-navigation-guard'

function Harness({
  dirty,
  onClick,
}: {
  dirty: boolean
  onClick: () => void
}) {
  useDirtyNavigationGuard(dirty)
  return (
    <a
      href="/elsewhere"
      onClick={(event) => {
        event.preventDefault()
        onClick()
      }}
    >
      رفتن
    </a>
  )
}

describe('useDirtyNavigationGuard (SS-276)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('blocks in-app anchor navigation when the user cancels the prompt', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onClick = vi.fn()
    render(<Harness dirty onClick={onClick} />)

    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('allows navigation after confirmation and when clean', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const dirtyClick = vi.fn()
    render(<Harness dirty onClick={dirtyClick} />)
    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(dirtyClick).toHaveBeenCalledOnce()
    cleanup()

    const cleanClick = vi.fn()
    render(<Harness dirty={false} onClick={cleanClick} />)
    fireEvent.click(screen.getByRole('link', { name: 'رفتن' }))
    expect(cleanClick).toHaveBeenCalledOnce()
  })
})
