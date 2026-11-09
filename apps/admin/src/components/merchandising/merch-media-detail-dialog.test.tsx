// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MerchMediaDetailDto,
  MerchMediaSummaryDto,
} from '@sabz/types'
import { MerchMediaDetailDialog } from './merch-media-detail-dialog'
import {
  getMerchMedia,
  getMerchMediaFile,
  updateMerchMedia,
} from '../../services/merchandising'

vi.mock('../../services/merchandising', () => ({
  getMerchMedia: vi.fn(),
  getMerchMediaFile: vi.fn(),
  updateMerchMedia: vi.fn(),
}))

const mockDetail = vi.mocked(getMerchMedia)
const mockFile = vi.mocked(getMerchMediaFile)
const mockUpdate = vi.mocked(updateMerchMedia)
const createObjectURL = vi.fn(() => 'blob:full')
const revokeObjectURL = vi.fn()

const summary: MerchMediaSummaryDto = {
  id: 'media-1',
  originalName: 'hero.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  width: 1200,
  height: 800,
  altFa: 'تصویر قبلی',
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

const detail: MerchMediaDetailDto = {
  ...summary,
  deletedAt: null,
  usage: {
    campaigns: [
      { id: 'campaign-1', internalName: 'کمپین پاییز', archivedAt: null },
    ],
    currentPublications: [{ id: 'pub-2', version: 2, status: 'PUBLISHED' }],
    scheduledPublications: [{ id: 'pub-3', version: 3, status: 'SCHEDULED' }],
  },
}

describe('MerchMediaDetailDialog (SS-274)', () => {
  beforeEach(() => {
    mockDetail.mockReset()
    mockFile.mockReset()
    mockUpdate.mockReset()
    mockDetail.mockResolvedValue(detail)
    mockFile.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
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

  it('loads authenticated preview, metadata, usage, and only the alt field', async () => {
    render(
      <MerchMediaDetailDialog
        open
        media={summary}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    )

    expect(await screen.findByText('کمپین پاییز')).toBeTruthy()
    expect(screen.getByText('نسخه 2')).toBeTruthy()
    expect(screen.getByText('نسخه 3')).toBeTruthy()
    expect(screen.getAllByText('منتشرنشده').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'تصویر قبلی' })).toBeTruthy()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.queryByLabelText(/نقطه کانونی/)).toBeNull()
    expect(mockDetail).toHaveBeenCalledWith('media-1')
    expect(mockFile).toHaveBeenCalledWith('media-1')
  })

  it('saves alt text through the update endpoint and reports the change', async () => {
    const onChanged = vi.fn()
    mockUpdate.mockResolvedValue({
      ...summary,
      altFa: 'تصویر جدید',
    })
    render(
      <MerchMediaDetailDialog
        open
        media={summary}
        onClose={() => {}}
        onChanged={onChanged}
      />,
    )

    const altInput = await screen.findByLabelText('متن جایگزین (alt)')
    fireEvent.change(altInput, { target: { value: 'تصویر جدید' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'ذخیره متن جایگزین' }),
    )

    expect(mockUpdate).toHaveBeenCalledWith('media-1', {
      altFa: 'تصویر جدید',
    })
    expect(await screen.findByText('متن جایگزین ذخیره شد.')).toBeTruthy()
    expect(onChanged).toHaveBeenCalledOnce()
  })
})
