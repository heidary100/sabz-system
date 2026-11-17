// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchMediaSummaryDto } from '@sabz/types'
import { MerchMediaUploadDialog } from './merch-media-upload-dialog'
import { uploadMerchMedia } from '../../services/merchandising'

vi.mock('../../services/merchandising', () => ({
  uploadMerchMedia: vi.fn(),
}))

const mockUpload = vi.mocked(uploadMerchMedia)

const uploaded: MerchMediaSummaryDto = {
  id: 'media-1',
  originalName: 'hero.png',
  mimeType: 'image/png',
  sizeBytes: 1024,
  width: 1200,
  height: 800,
  altFa: 'تصویر کمپین',
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

describe('MerchMediaUploadDialog (SS-274)', () => {
  beforeEach(() => {
    mockUpload.mockReset()
  })

  afterEach(cleanup)

  it('submits the supported file with optional alt and reports progress', async () => {
    let resolveUpload: (value: MerchMediaSummaryDto) => void = () => {}
    mockUpload.mockImplementation((_file, options) => {
      options?.onProgress?.(42)
      return new Promise((resolve) => {
        resolveUpload = resolve
      })
    })
    const onSuccess = vi.fn()
    render(
      <MerchMediaUploadDialog open onClose={() => {}} onSuccess={onSuccess} />,
    )

    const file = new File(['image'], 'hero.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('فایل تصویر'), {
      target: { files: [file] },
    })
    fireEvent.change(screen.getByLabelText('متن جایگزین (اختیاری)'), {
      target: { value: '  تصویر کمپین  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری' }))

    expect(mockUpload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ altFa: '  تصویر کمپین  ' }),
    )
    await waitFor(() =>
      expect(screen.getAllByText(/در حال بارگذاری… 42٪/).length).toBeGreaterThan(
        0,
      ),
    )
    const pendingButton = screen.getByRole('button', {
      name: /در حال بارگذاری… 42٪/,
    }) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)
    fireEvent.click(pendingButton)
    expect(mockUpload).toHaveBeenCalledTimes(1)

    await act(async () => resolveUpload(uploaded))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(uploaded))
  })

  it('exposes progressbar semantics and a single stable upload announcement', async () => {
    let resolveUpload: (value: MerchMediaSummaryDto) => void = () => {}
    mockUpload.mockImplementation((_file, options) => {
      options?.onProgress?.(42)
      return new Promise((resolve) => {
        resolveUpload = resolve
      })
    })
    render(
      <MerchMediaUploadDialog open onClose={() => {}} onSuccess={() => {}} />,
    )

    const file = new File(['image'], 'hero.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('فایل تصویر'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری' }))

    const progressbar = screen.getByRole('progressbar', {
      name: 'پیشرفت بارگذاری تصویر',
    })
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0')
    expect(progressbar.getAttribute('aria-valuemax')).toBe('100')
    expect(progressbar.getAttribute('aria-valuenow')).toBe('42')
    expect(screen.getByRole('status').textContent).toContain(
      'بارگذاری تصویر آغاز شد.',
    )

    await act(async () => resolveUpload(uploaded))
  })

  it('rejects unsupported file types before upload', () => {
    render(
      <MerchMediaUploadDialog
        open
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText('فایل تصویر'), {
      target: { files: [file] },
    })

    expect(
      screen.getAllByText('فقط تصویر JPG، PNG و WEBP مجاز است.').length,
    ).toBeGreaterThan(0)
    expect(
      (screen.getByRole('button', { name: 'بارگذاری' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    const input = screen.getByLabelText('فایل تصویر') as HTMLInputElement
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const describedText = describedBy!
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
    expect(describedText).toContain('فقط تصویر JPG، PNG و WEBP مجاز است.')
  })

  it('rejects oversized images before upload', () => {
    render(
      <MerchMediaUploadDialog
        open
        onClose={() => {}}
        onSuccess={() => {}}
      />,
    )

    const file = new File(['image'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('فایل تصویر'), {
      target: { files: [file] },
    })

    expect(screen.getByText(/حداکثر ۱۰ مگابایت/)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'بارگذاری' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
})
