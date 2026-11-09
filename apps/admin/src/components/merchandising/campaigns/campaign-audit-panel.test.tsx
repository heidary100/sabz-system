// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CampaignAuditPanel } from './campaign-audit-panel'
import { listAudit } from '../../../services/audit'

vi.mock('../../../services/audit', () => ({ listAudit: vi.fn() }))

const mockAudit = vi.mocked(listAudit)

describe('CampaignAuditPanel (SS-275)', () => {
  beforeEach(() => {
    mockAudit.mockReset()
    mockAudit.mockResolvedValue({
      items: [
        {
          id: 'audit-1',
          userId: 'user-1',
          actor: {
            id: 'user-1',
            mobile: '09120000000',
            firstName: 'مدیر',
            lastName: null,
          },
          action: 'MERCH_CAMPAIGN_UPDATED',
          entity: 'MerchCampaign',
          entityId: 'campaign-1',
          before: { titleFa: 'قدیمی' },
          after: { titleFa: 'تازه' },
          ipAddress: null,
          createdAt: '2026-11-09T10:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    })
  })

  afterEach(cleanup)

  it('loads one bounded campaign audit request and shows translated labels', async () => {
    render(<CampaignAuditPanel campaignId="campaign-1" enabled />)

    expect(await screen.findByText('به‌روزرسانی کمپین')).toBeTruthy()
    expect(screen.getByText('مدیر')).toBeTruthy()
    expect(mockAudit).toHaveBeenCalledWith({
      entity: 'MerchCampaign',
      entityId: 'campaign-1',
      page: 1,
      limit: 20,
    })
    fireEvent.click(screen.getByRole('button', { name: 'مشاهده' }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    expect(screen.getByText('قبل')).toBeTruthy()
    expect(screen.getByText('بعد')).toBeTruthy()
  })
})
