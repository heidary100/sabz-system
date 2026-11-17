import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MerchCampaignSummaryDto } from '@sabz/types'
import { Megaphone, Plus, Search } from 'lucide-react'
import { useMerchCampaignList } from '../../hooks/use-merch-campaign-list'
import type { CampaignBooleanFilter } from '../../hooks/use-merch-campaign-list'
import {
  MERCH_CAMPAIGN_TYPE_LABELS,
  MERCH_CAMPAIGN_TYPE_ORDER,
} from '../../lib/merchandising-labels'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../../lib/merchandising-errors'
import { translateApiError } from '../../lib/error-messages'
import { formatDateTime } from '../../lib/format'
import { formatTehranDateTime } from '../../lib/tehran-time'
import { Button } from '../../components/catalyst/button'
import { Field, Label } from '../../components/catalyst/fieldset'
import { Input, InputGroup } from '../../components/catalyst/input'
import { Select } from '../../components/catalyst/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/catalyst/table'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { InlineError } from '../../components/ui/inline-error'
import { LinkButton } from '../../components/ui/link-button'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { TableCard } from '../../components/ui/table-card'
import { TablePagination } from '../../components/ui/table-pagination'
import { MerchCampaignStatusBadge } from '../../components/merchandising/merch-campaign-status-badge'
import {
  disableMerchCampaign,
  enableMerchCampaign,
} from '../../services/merchandising'

export function MerchandisingCampaignsPage() {
  const {
    search,
    type,
    isEnabled,
    isArchived,
    page,
    limit,
    result,
    loading,
    error,
    setSearch,
    setType,
    setEnabled,
    setArchived,
    setPage,
    setLimit,
    refetch,
  } = useMerchCampaignList()
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const hasFilters =
    search.trim() !== '' ||
    type !== '' ||
    isEnabled !== '' ||
    isArchived !== 'false'
  const totalPages = result ? Math.max(1, Math.ceil(result.total / limit)) : 1

  const clearFilters = (): void => {
    setSearch('')
    setType('')
    setEnabled('')
    setArchived('false')
  }

  const toggleEnabled = async (
    campaign: MerchCampaignSummaryDto,
  ): Promise<void> => {
    if (mutatingId) {
      return
    }
    setMutatingId(campaign.id)
    setActionError(null)
    setActionMessage(null)
    try {
      const updated = campaign.isEnabled
        ? await disableMerchCampaign(campaign.id)
        : await enableMerchCampaign(campaign.id)
      setActionMessage(
        `کمپین «${updated.internalName}» ${updated.isEnabled ? 'فعال' : 'غیرفعال'} شد.`,
      )
      await refetch()
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      setActionError(merchandisingErrorMessage(error))
      if (parsed?.status === 409) {
        await refetch()
      }
    } finally {
      setMutatingId(null)
    }
  }

  return (
    <div className="w-full space-y-6">
      <PageHeader
        title="کمپین‌ها"
        subtitle="محتوای منبع صفحه اصلی؛ ویرایش کمپین نسخه‌های منتشرشده را تغییر نمی‌دهد."
        actions={
          <LinkButton to="/merchandising/campaigns/new" color="primary">
            <Plus data-slot="icon" />
            کمپین جدید
          </LinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field>
          <Label htmlFor="campaign-search">جستجو</Label>
          <InputGroup>
            <Search data-slot="icon" aria-hidden="true" />
            <Input
              id="campaign-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="نام داخلی یا عنوان فارسی"
            />
          </InputGroup>
        </Field>
        <Field>
          <Label htmlFor="campaign-type">نوع کمپین</Label>
          <Select
            id="campaign-type"
            value={type}
            onChange={(event) =>
              setType(
                event.target.value as
                  | (typeof MERCH_CAMPAIGN_TYPE_ORDER)[number]
                  | '',
              )
            }
          >
            <option value="">همه نوع‌ها</option>
            {MERCH_CAMPAIGN_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {MERCH_CAMPAIGN_TYPE_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label htmlFor="campaign-enabled">فعال بودن</Label>
          <Select
            id="campaign-enabled"
            value={isEnabled}
            onChange={(event) =>
              setEnabled(event.target.value as CampaignBooleanFilter)
            }
          >
            <option value="">همه</option>
            <option value="true">فعال</option>
            <option value="false">غیرفعال</option>
          </Select>
        </Field>
        <Field>
          <Label htmlFor="campaign-archived">بایگانی</Label>
          <Select
            id="campaign-archived"
            value={isArchived}
            onChange={(event) =>
              setArchived(event.target.value as CampaignBooleanFilter)
            }
          >
            <option value="false">بایگانی‌نشده</option>
            <option value="true">بایگانی‌شده</option>
            <option value="">همه</option>
          </Select>
        </Field>
      </div>

      {actionError && <InlineError message={actionError} />}
      {actionMessage && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {actionMessage}
        </p>
      )}

      {loading && !result ? (
        <Loading compact label="در حال بارگذاری کمپین‌ها…" />
      ) : error ? (
        <ErrorState
          message={translateApiError(error)}
          onRetry={() => void refetch()}
        />
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="size-6" aria-hidden="true" />}
          title={
            hasFilters
              ? 'کمپینی با این فیلتر پیدا نشد'
              : 'هنوز کمپینی ثبت نشده است'
          }
          description={
            hasFilters
              ? 'عبارت جستجو یا فیلترها را تغییر دهید.'
              : 'نخستین کمپین را بسازید؛ کمپین فقط از طریق انتشار صفحه اصلی عمومی می‌شود.'
          }
          actions={
            hasFilters ? (
              <Button outline onClick={clearFilters}>
                پاک کردن فیلترها
              </Button>
            ) : (
              <LinkButton to="/merchandising/campaigns/new" color="primary">
                <Plus data-slot="icon" />
                ایجاد کمپین
              </LinkButton>
            )
          }
        />
      ) : (
        <div aria-busy={loading}>
          <TableCard>
            <TablePagination
              position="top"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={limit}
              limitOptions={[20, 50, 100]}
              onLimitChange={setLimit}
              disabled={loading}
              totalLabel="کمپین"
            />
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>کمپین</TableHeader>
                  <TableHeader>نوع</TableHeader>
                  <TableHeader>وضعیت</TableHeader>
                  <TableHeader>بازه (تهران) / اولویت</TableHeader>
                  <TableHeader>آخرین تغییر</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <Link
                        to={`/merchandising/campaigns/${campaign.id}`}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {campaign.internalName}
                      </Link>
                      <p className="text-xs text-muted">{campaign.titleFa}</p>
                    </TableCell>
                    <TableCell className="text-muted">
                      {MERCH_CAMPAIGN_TYPE_LABELS[campaign.type]}
                    </TableCell>
                    <TableCell>
                      <MerchCampaignStatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted">
                      <p>
                        {campaign.startsAt || campaign.endsAt
                          ? `${formatTehranDateTime(campaign.startsAt)} تا ${formatTehranDateTime(campaign.endsAt)}`
                          : 'بدون بازه زمانی'}
                      </p>
                      <p>اولویت {campaign.priority.toLocaleString('fa-IR')}</p>
                    </TableCell>
                    <TableCell className="text-muted">
                      {formatDateTime(campaign.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <LinkButton
                          to={`/merchandising/campaigns/${campaign.id}`}
                          plain
                        >
                          ویرایش
                        </LinkButton>
                        {!campaign.isArchived && (
                          <Button
                            outline
                            disabled={mutatingId !== null}
                            onClick={() => void toggleEnabled(campaign)}
                          >
                            {mutatingId === campaign.id
                              ? 'در حال ذخیره…'
                              : campaign.isEnabled
                                ? 'غیرفعال‌سازی'
                                : 'فعال‌سازی'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={limit}
              limitOptions={[20, 50, 100]}
              onLimitChange={setLimit}
              disabled={loading}
              totalLabel="کمپین"
            />
          </TableCard>
        </div>
      )}

      {loading && result && (
        <div
          role="status"
          className="flex items-center justify-center gap-3 py-2"
        >
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
          />
          <span className="text-sm font-medium text-muted">
            در حال به‌روزرسانی…
          </span>
        </div>
      )}
    </div>
  )
}
