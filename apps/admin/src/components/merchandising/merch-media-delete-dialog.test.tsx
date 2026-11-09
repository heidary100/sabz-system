// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MerchMediaDetailDto,
  MerchMediaSummaryDto,
} from '@sabz/types'
import { MerchMediaDeleteDialog } from './merch-media-delete-dialog'
import { ApiError } from '../../services/api'
import {
  deleteMerchMedia,
  getMerchMedia,
} from '../../services/merchandising'

vi.mock('../../services/merchandising', () => ({
  getMerchMedia: vi.fn(),
  deleteMerchMedia: vi.fn(),
}))

const mockDetail = vi.mocked(getMerchMedia)
const mockDelete = vi.mocked(deleteMerchMedia)

const summary: MerchMediaSummaryDto = {
  id: 'media-1',
  originalName: 'hero.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  width: 1200,
  height: 800,
  altFa: null,
  status: 'DRAFT',
  publishedAt: null,
  createdAt: '2026-11-09T10:00:00.000Z',
  updatedAt: '2026-11-09T10:00:00.000Z',
}

function detail(
  usage: Partial<MerchMediaDetailDto['usage']> = {},
): MerchMediaDetailDto {
  return {
    ...summary,
    deletedAt: null,
    usage: {
      campaigns: [],
      currentPublications: [],
      scheduledPublications: [],
      ...usage,
    },
  }
}

function deleteButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'حذف رسانه' }) as HTMLButtonElement
}

describe('MerchMediaDeleteDialog (SS-274)', () => {
  beforeEach(() => {
    mockDetail.mockReset()
    mockDelete.mockReset()
  })

  afterEach(cleanup)

  it('confirms soft deletion when the asset is unused', async () => {
    const onDeleted = vi.fn()
    mockDetail.mockResolvedValue(detail())
    mockDelete.mockResolvedValue(summary)
    render(
      <MerchMediaDeleteDialog
        open
        media={summary}
        onClose={() => {}}
        onDeleted={onDeleted}
        onConflict={() => {}}
      />,
    )

    expect(
      await screen.findByText('در هیچ کمپینی استفاده نشده است.'),
    ).toBeTruthy()
    await waitFor(() => expect(deleteButton().disabled).toBe(false))
    fireEvent.click(deleteButton())

    expect(mockDelete).toHaveBeenCalledWith('media-1')
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(detail()))
  })

  it('blocks deletion when usage is present', async () => {
    mockDetail.mockResolvedValue(
      detail({
        campaigns: [
          { id: 'campaign-1', internalName: 'کمپین پاییز', archivedAt: null },
        ],
      }),
    )
    render(
      <MerchMediaDeleteDialog
        open
        media={summary}
        onClose={() => {}}
        onDeleted={() => {}}
        onConflict={() => {}}
      />,
    )

    expect(await screen.findByText('کمپین پاییز')).toBeTruthy()
    expect(
      screen.getByText(/استفاده می‌شود و حذف آن مسدود است/),
    ).toBeTruthy()
    expect(deleteButton().disabled).toBe(true)
  })

  it('refreshes usage and reports the conflict after a server 409', async () => {
    const onConflict = vi.fn()
    mockDetail
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(
        detail({
          campaigns: [
            { id: 'campaign-1', internalName: 'کمپین جدید', archivedAt: null },
          ],
        }),
      )
    mockDelete.mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        error: 'Conflict',
        message: 'این رسانه به کمپین وابسته است.',
      }),
    )
    render(
      <MerchMediaDeleteDialog
        open
        media={summary}
        onClose={() => {}}
        onDeleted={() => {}}
        onConflict={onConflict}
      />,
    )

    await screen.findByText('در هیچ کمپینی استفاده نشده است.')
    await waitFor(() => expect(deleteButton().disabled).toBe(false))
    fireEvent.click(deleteButton())

    expect(
      await screen.findByText('این رسانه به کمپین وابسته است.'),
    ).toBeTruthy()
    expect(await screen.findByText('کمپین جدید')).toBeTruthy()
    expect(onConflict).toHaveBeenCalledOnce()
    await waitFor(() => expect(deleteButton().disabled).toBe(true))
    expect(mockDetail).toHaveBeenCalledTimes(2)
  })
})
