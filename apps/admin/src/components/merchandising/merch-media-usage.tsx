import type { MerchMediaUsageDto } from '@sabz/types'
import { Text } from '../catalyst/text'
import { hasMerchMediaUsage } from '../../lib/merchandising-media'

export function MerchMediaUsage({
  usage,
  showBlockingNote = false,
}: {
  usage: MerchMediaUsageDto
  showBlockingNote?: boolean
}) {
  const usagePresent = hasMerchMediaUsage(usage)

  return (
    <div className="space-y-3">
      <UsageGroup
        label="کمپین‌ها"
        emptyLabel="در هیچ کمپینی استفاده نشده است."
        items={usage.campaigns.map((campaign) => ({
          key: campaign.id,
          text: campaign.archivedAt
            ? `${campaign.internalName} (بایگانی‌شده)`
            : campaign.internalName,
        }))}
      />
      <UsageGroup
        label="نسخه جاری صفحه اصلی"
        emptyLabel="در نسخه جاری صفحه اصلی استفاده نشده است."
        items={usage.currentPublications.map((publication) => ({
          key: publication.id,
          text: `نسخه ${publication.version}`,
        }))}
      />
      <UsageGroup
        label="انتشارهای زمان‌بندی‌شده"
        emptyLabel="در انتشار زمان‌بندی‌شده‌ای استفاده نشده است."
        items={usage.scheduledPublications.map((publication) => ({
          key: publication.id,
          text: `نسخه ${publication.version}`,
        }))}
      />
      {showBlockingNote && usagePresent && (
        <Text className="text-xs text-muted">
          تا زمانی که این ارجاع‌ها باقی باشند، حذف رسانه مسدود است.
        </Text>
      )}
    </div>
  )
}

function UsageGroup({
  label,
  emptyLabel,
  items,
}: {
  label: string
  emptyLabel: string
  items: Array<{ key: string; text: string }>
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
          {items.map((item) => (
            <li key={item.key}>{item.text}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
