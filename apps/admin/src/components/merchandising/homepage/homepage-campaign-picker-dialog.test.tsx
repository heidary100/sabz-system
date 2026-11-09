// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MerchCampaignListResponse, MerchCampaignSummaryDto } from '@sabz/types'
import { HomepageCampaignPickerDialog } from './homepage-campaign-picker-dialog'
import { listMerchCampaigns } from '../../../services/merchandising'

vi.mock('../../../services/merchandising', () => ({
  listMerchCampaigns: vi.fn(),
}))

const mockList = vi.mocked(listMerchCampaigns)

const campaign: MerchCampaignSummaryDto = {
  id: 'campaign-1',
  internalName: 'کمپین پاییز',
  type: 'SEASONAL',
  titleFa: 'پاییز گرم',
  status: 'ACTIVE_WINDOW',
  scheduleStatus: 'ACTIVE',
  isEnabled: true,
  isArchived: false,
  startsAt: null,
  endsAt: null,
  priority: 0,
  archivedAt: null,
  updatedAt: '2026-11-09T10:00:00.000Z',
}

function result(): MerchCampaignListResponse {
  return { items: [campaign], total: 1, page: 1, limit: 20 }
}

describe('HomepageCampaignPickerDialog (SS-277)', () => {
  beforeEach(() => {
    mockList.mockReset()
    mockList.mockResolvedValue(result())
  })

  afterEach(cleanup)

  it('lists enabled, non-archived campaigns with search and pagination', async () => {
    const onPick = vi.fn()
    render(
      <HomepageCampaignPickerDialog
        open
        selectedIds={[]}
        maxReached={false}
        onPick={onPick}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('کمپین پاییز')).toBeTruthy()
    expect(screen.getByText('پاییز گرم')).toBeTruthy()
    expect(screen.getByText('در بازه فعال')).toBeTruthy()
    expect(mockList).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      q: undefined,
      isEnabled: true,
      isArchived: false,
    })

    fireEvent.change(screen.getByLabelText('جستجوی کمپین'), {
      target: { value: 'پاییز' },
    })
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'پاییز', isEnabled: true, isArchived: false }),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }))
    expect(onPick).toHaveBeenCalledWith(campaign)
  })

  it('prevents duplicate/max selections', async () => {
    const { rerender } = render(
      <HomepageCampaignPickerDialog
        open
        selectedIds={[campaign.id]}
        maxReached={false}
        onPick={() => {}}
        onClose={() => {}}
      />,
    )
    expect(
      (
        await screen.findByRole('button', {
          name: 'افزوده‌شده',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)

    rerender(
      <HomepageCampaignPickerDialog
        open
        selectedIds={[]}
        maxReached
        onPick={() => {}}
        onClose={() => {}}
      />,
    )
    expect(
      (
        await screen.findByRole('button', {
          name: 'محدودیت تکمیل است',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
