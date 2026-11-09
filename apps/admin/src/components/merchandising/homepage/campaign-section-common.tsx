import { Link } from 'react-router-dom'
import type { MerchCampaignDto } from '@sabz/types'
import { Text } from '../../catalyst/text'
import { StatusBadge } from '../../ui/status-badge'
import { MerchCampaignStatusBadge } from '../merch-campaign-status-badge'
import { MerchMediaThumbnail } from '../merch-media-thumbnail'
import { MERCH_CAMPAIGN_TYPE_LABELS, mediaSlotLabel } from '../../../lib/merchandising-labels'
import { formatTehranDateTime } from '../../../lib/tehran-time'

export function CampaignDetailHeader({
  campaign,
}: {
  campaign: MerchCampaignDto
}) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="truncate text-sm font-semibold text-foreground">
          {campaign.internalName}
        </p>
        <MerchCampaignStatusBadge status={campaign.status} />
        <StatusBadge tone="neutral">
          {MERCH_CAMPAIGN_TYPE_LABELS[campaign.type]}
        </StatusBadge>
      </div>
      <p className="truncate text-xs text-muted">{campaign.titleFa}</p>
      <p className="text-xs text-muted">
        {campaign.startsAt || campaign.endsAt
          ? `${formatTehranDateTime(campaign.startsAt)} تا ${formatTehranDateTime(campaign.endsAt)}`
          : 'بدون بازه زمانی'}
      </p>
      {(campaign.isArchived || !campaign.isEnabled) && (
        <p className="text-xs text-danger">
          {campaign.isArchived
            ? 'کمپین بایگانی شده و برای انتشار صفحه اصلی قابل استفاده نیست.'
            : 'کمپین غیرفعال است و برای انتشار صفحه اصلی قابل استفاده نیست.'}
        </p>
      )}
      <Link
        to={`/merchandising/campaigns/${campaign.id}`}
        className="inline-block text-xs font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
      >
        ویرایش کمپین
      </Link>
    </div>
  )
}

export function CampaignCategorySummary({
  campaign,
  emptyMessage = 'این کمپین هیچ دسته‌بندی‌ای ندارد.',
}: {
  campaign: MerchCampaignDto
  emptyMessage?: string
}) {
  return (
    <div className="space-y-1">
      <Text className="text-xs text-muted">
        دسته‌بندی‌های کمپین ({campaign.categories.length.toLocaleString('fa-IR')})
      </Text>
      {campaign.categories.length === 0 ? (
        <Text className="text-xs text-warning">{emptyMessage}</Text>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {campaign.categories.map((category) => (
            <li key={category.id}>
              <StatusBadge tone="neutral">{category.name}</StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CampaignMediaSummary({
  campaign,
  compact = false,
}: {
  campaign: MerchCampaignDto
  compact?: boolean
}) {
  return (
    <div className="space-y-1">
      <Text className="text-xs text-muted">
        رسانه‌های کمپین ({campaign.media.length.toLocaleString('fa-IR')})
      </Text>
      {campaign.media.length === 0 ? (
        <Text className="text-xs text-warning">
          این کمپین رسانه‌ای ندارد.
        </Text>
      ) : (
        <ul className={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 gap-2 sm:grid-cols-4'}>
          {campaign.media.map((media) => (
            <li
              key={media.id}
              className="overflow-hidden rounded-lg border border-border bg-background/40"
            >
              <div className={compact ? 'size-14' : 'aspect-video'}>
                <MerchMediaThumbnail
                  mediaId={media.mediaId}
                  alt={media.altFa ?? media.originalName}
                />
              </div>
              <div className="space-y-0.5 px-1.5 py-1">
                <p className="truncate text-[11px] font-medium text-foreground">
                  {mediaSlotLabel(media.slot)}
                </p>
                <p dir="ltr" className="truncate text-[10px] text-muted">
                  {media.originalName}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
