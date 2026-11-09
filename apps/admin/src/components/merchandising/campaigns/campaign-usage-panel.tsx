import { Link } from 'react-router-dom'
import type { MerchCampaignDto } from '@sabz/types'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { formatDateTime } from '../../../lib/format'
import { formatTehranDateTime } from '../../../lib/tehran-time'
import { MERCH_CAMPAIGN_SCHEDULE_STATUS_LABELS } from '../../../lib/merchandising-labels'
import { MerchCampaignStatusBadge } from '../merch-campaign-status-badge'

export function CampaignUsagePanel({
  campaign,
}: {
  campaign: MerchCampaignDto
}) {
  const { currentPublications, scheduledPublications } = campaign.usage
  const hasUsage =
    currentPublications.length > 0 || scheduledPublications.length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              وضعیت کمپین
            </p>
            <Text className="text-xs text-muted">
              وضعیت اداری است و به‌تنهایی به معنی انتشار عمومی نیست.
            </Text>
          </div>
          <MerchCampaignStatusBadge status={campaign.status} />
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">فعال</dt>
            <dd className="text-foreground">
              {campaign.isEnabled ? 'بله' : 'خیر'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">وضعیت بازه</dt>
            <dd className="text-foreground">
              {MERCH_CAMPAIGN_SCHEDULE_STATUS_LABELS[campaign.scheduleStatus]}
            </dd>
          </div>
          <div>
            <dt className="text-muted">آخرین تغییر</dt>
            <dd className="text-foreground">
              {formatDateTime(campaign.updatedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">تغییرات نسبت به نسخه منتشرشده</dt>
            <dd className="text-foreground">
              {campaign.hasUnpublishedChanges === null
                ? 'نامشخص — مقایسه تخمینی ممکن نیست'
                : campaign.hasUnpublishedChanges
                  ? 'تغییرات ذخیره‌نشده در نسخه منتشرشده وجود دارد (تخمینی)'
                  : 'هم‌راستا با محتوای منتشرشده (تخمینی)'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">
          استفاده در صفحه اصلی
        </p>
        <Text className="mt-1 text-xs text-muted">
          ویرایش کمپین، نسخه‌های منتشرشده صفحه اصلی را تغییر نمی‌دهد. برای
          اعمال تغییرات، صفحه اصلی باید دوباره منتشر شود.
        </Text>

        {!hasUsage ? (
          <Text className="mt-3 text-sm text-muted">
            این کمپین در نسخه منتشرشده یا زمان‌بندی‌شده‌ای استفاده نمی‌شود.
          </Text>
        ) : (
          <div className="mt-3 space-y-3">
            {currentPublications.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted">
                  نسخه‌های منتشرشده
                </p>
                <ul className="mt-1 space-y-1 text-sm text-foreground">
                  {currentPublications.map((publication) => (
                    <li key={publication.id}>
                      نسخه {publication.version.toLocaleString('fa-IR')}
                      {publication.publishedAt
                        ? ` · ${formatTehranDateTime(publication.publishedAt)}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scheduledPublications.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted">
                  نسخه‌های زمان‌بندی‌شده
                </p>
                <ul className="mt-1 space-y-1 text-sm text-foreground">
                  {scheduledPublications.map((publication) => (
                    <li key={publication.id}>
                      نسخه {publication.version.toLocaleString('fa-IR')}
                      {publication.publishAt
                        ? ` · ${formatTehranDateTime(publication.publishAt)}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {hasUsage && (
          <div className="mt-3">
            <Link to="/merchandising/publications">
              <Button outline>مشاهده انتشارهای صفحه اصلی</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
