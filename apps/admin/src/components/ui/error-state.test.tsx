// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorState } from './error-state'

describe('ErrorState (SS-271)', () => {
  afterEach(cleanup)

  it('announces the failure and offers a retry', () => {
    const onRetry = vi.fn()
    render(<ErrorState message="خطای شبکه" onRetry={onRetry} />)

    expect(screen.getByRole('alert').textContent).toContain('خطای شبکه')
    fireEvent.click(screen.getByRole('button', { name: 'تلاش مجدد' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders custom actions without a retry button', () => {
    render(
      <ErrorState message="دسترسی ندارید">
        <a href="/products">بازگشت</a>
      </ErrorState>,
    )

    expect(screen.getByRole('link', { name: 'بازگشت' })).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
