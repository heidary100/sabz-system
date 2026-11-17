// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MerchMediaThumbnail } from './merch-media-thumbnail'
import { getMerchMediaThumbnail } from '../../services/merchandising'

vi.mock('../../services/merchandising', () => ({
  getMerchMediaThumbnail: vi.fn(),
}))

const mockThumbnail = vi.mocked(getMerchMediaThumbnail)
const createObjectURL = vi.fn(() => 'blob:thumbnail')
const revokeObjectURL = vi.fn()

describe('MerchMediaThumbnail (SS-274)', () => {
  beforeEach(() => {
    mockThumbnail.mockReset()
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    })
  })

  afterEach(cleanup)

  it('loads the authenticated thumbnail and revokes the object URL', async () => {
    mockThumbnail.mockResolvedValue(new Blob(['image'], { type: 'image/webp' }))
    const { unmount } = render(
      <MerchMediaThumbnail mediaId="media-1" alt="تصویر کمپین" />,
    )

    const image = await screen.findByRole('img', { name: 'تصویر کمپین' })
    expect(image.getAttribute('src')).toBe('blob:thumbnail')
    expect(mockThumbnail).toHaveBeenCalledWith('media-1')

    unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumbnail')
  })

  it('shows a stable fallback when the authenticated preview fails', async () => {
    mockThumbnail.mockRejectedValue(new Error('forbidden'))
    render(<MerchMediaThumbnail mediaId="media-2" alt="تصویر" />)

    await waitFor(() =>
      expect(screen.getByText('پیش‌نمایش در دسترس نیست')).toBeTruthy(),
    )
    expect(screen.queryByRole('img')).toBeNull()
  })
})
