import type { MerchCampaignStatus } from '@sabz/types'
import { StatusBadge } from '../ui/status-badge'
import {
  merchCampaignStatusLabel,
  merchCampaignStatusTone,
} from '../../lib/merchandising-status'

export function MerchCampaignStatusBadge({
  status,
}: {
  status: MerchCampaignStatus
}) {
  return (
    <StatusBadge tone={merchCampaignStatusTone(status)}>
      {merchCampaignStatusLabel(status)}
    </StatusBadge>
  )
}
