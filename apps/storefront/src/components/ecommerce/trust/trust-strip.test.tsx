// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MerchTrustItem } from '@sabz/types'
import { TrustStrip } from './trust-strip'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TrustStrip', () => {
  it('renders duplicate titles with stable unique React keys', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const items: MerchTrustItem[] = [
      { icon: 'truck', title: 'ارسال سریع' },
      { icon: 'truck', title: 'ارسال سریع' },
    ]

    render(<TrustStrip items={items} />)

    expect(screen.getAllByText('ارسال سریع')).toHaveLength(2)
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining('same key'),
    )
  })
})
