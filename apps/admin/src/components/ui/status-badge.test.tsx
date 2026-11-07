// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBadge } from './status-badge'
import {
  ORDER_STATUS_TONES,
  PAYMENT_STATUS_TONES,
  type StatusTone,
} from '../../lib/status-tones'

const TONES: StatusTone[] = ['neutral', 'info', 'warning', 'success', 'danger']

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'text-muted',
  info: 'text-info',
  warning: 'text-warning',
  success: 'text-success',
  danger: 'text-danger',
}

describe('StatusBadge (SS-271)', () => {
  afterEach(cleanup)

  it.each(TONES)('renders the %s tone with its semantic token class', (tone) => {
    render(<StatusBadge tone={tone}>وضعیت</StatusBadge>)
    const badge = screen.getByText('وضعیت')
    expect(badge.className).toContain(TONE_CLASS[tone])
  })

  it('maps every order and payment status to a semantic tone', () => {
    expect(ORDER_STATUS_TONES.PENDING).toBe('warning')
    expect(ORDER_STATUS_TONES.DELIVERED).toBe('success')
    expect(ORDER_STATUS_TONES.CANCELLED).toBe('neutral')
    expect(PAYMENT_STATUS_TONES.PAID).toBe('success')
    expect(PAYMENT_STATUS_TONES.FAILED).toBe('danger')
  })
})
