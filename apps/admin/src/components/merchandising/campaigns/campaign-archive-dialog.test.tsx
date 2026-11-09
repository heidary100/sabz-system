// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchCampaignDto } from '@sabz/types'
import { CampaignArchiveDialog } from './campaign-archive-dialog'
import { archiveMerchCampaign } from '../../../services/merchandising'
import { ApiError } from '../../../services/api'

vi.mock('../../../services/merchandising', () => ({
  archiveMerchCampaign: vi.fn(),
}))

const mockArchive = vi.mocked(archiveMerchCampaign)

function campaign(inUse: boolean): MerchCampaignDto {
  return {
    id: 'campaign-1',
    internalName: 'کمپین پاییز',
    type: 'SEASONAL',
    titleFa: 'پاییز',
    eyebrowFa: null,
    subtitleFa: null,
    descriptionFa: null,
    ctaLabelFa: null,
    cta: { kind: 'NONE' },
    isEnabled: true,
    startsAt: null,
    endsAt: null,
    priority: 0,
    status: 'ACTIVE_WINDOW',
    scheduleStatus: 'ACTIVE',
    isArchived: false,
    archivedAt: null,
    updatedAt: '2026-11-09T10:00:00.000Z',
    products: [],
    categories: [],
    brands: [],
    media: [],
    usage: {
      currentPublications: inUse
        ? [
            {
              id: 'pub-1',
              version: 2,
              status: 'PUBLISHED',
              publishAt: null,
              publishedAt: '2026-11-09T10:00:00.000Z',
            },
          ]
        : [],
      scheduledPublications: [],
    },
    hasUnpublishedChanges: null,
    createdBy: null,
    updatedBy: null,
    createdAt: '2026-11-09T10:00:00.000Z',
  }
}

describe('CampaignArchiveDialog (SS-275)', () => {
  beforeEach(() => {
    mockArchive.mockReset()
  })

  afterEach(cleanup)

  it('blocks archiving when current publication usage exists', () => {
    render(
      <CampaignArchiveDialog
        open
        campaign={campaign(true)}
        onClose={() => {}}
        onArchived={() => {}}
        onConflict={() => {}}
      />,
    )

    expect(screen.getByText(/ابتدا آن را از صفحه اصلی حذف/)).toBeTruthy()
    expect(
      (
        screen.getByRole('button', { name: 'بایگانی' }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })

  it('archives an unused campaign and reports the updated campaign', async () => {
    const updated = { ...campaign(false), isArchived: true, status: 'ARCHIVED' as const }
    mockArchive.mockResolvedValue(updated)
    const onArchived = vi.fn()
    const onClose = vi.fn()
    render(
      <CampaignArchiveDialog
        open
        campaign={campaign(false)}
        onClose={onClose}
        onArchived={onArchived}
        onConflict={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'بایگانی' }))
    expect(mockArchive).toHaveBeenCalledWith('campaign-1')
    await waitFor(() => expect(onArchived).toHaveBeenCalledWith(updated))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a 409 conflict and refreshes authoritative data', async () => {
    const onConflict = vi.fn()
    mockArchive.mockRejectedValue(
      new ApiError(409, {
        statusCode: 409,
        error: 'MERCH_CAMPAIGN_IN_USE',
        message: 'این کمپین در صفحه اصلی استفاده می‌شود.',
      }),
    )
    render(
      <CampaignArchiveDialog
        open
        campaign={campaign(false)}
        onClose={() => {}}
        onArchived={() => {}}
        onConflict={onConflict}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'بایگانی' }))
    expect(
      await screen.findByText('این کمپین در صفحه اصلی استفاده می‌شود.'),
    ).toBeTruthy()
    expect(onConflict).toHaveBeenCalledOnce()
  })
})
