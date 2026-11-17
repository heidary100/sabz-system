import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  MerchCampaignListResponse,
  MerchCampaignSummaryDto,
} from '@sabz/types'
import { Search } from 'lucide-react'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Input, InputGroup } from '../../catalyst/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../catalyst/table'
import { Text } from '../../catalyst/text'
import { EmptyState } from '../../ui/empty-state'
import { ErrorState } from '../../ui/error-state'
import { Loading } from '../../ui/loading'
import { TablePagination } from '../../ui/table-pagination'
import { MerchCampaignStatusBadge } from '../merch-campaign-status-badge'
import { translateApiError } from '../../../lib/error-messages'
import { MERCH_CAMPAIGN_TYPE_LABELS } from '../../../lib/merchandising-labels'
import { listMerchCampaigns } from '../../../services/merchandising'

const PAGE_SIZE = 20

export function HomepageCampaignPickerDialog({
  open,
  selectedIds,
  maxReached,
  pickLabel = 'افزودن',
  onPick,
  onClose,
}: {
  open: boolean
  selectedIds: string[]
  maxReached: boolean
  pickLabel?: string
  onPick: (campaign: MerchCampaignSummaryDto) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<MerchCampaignListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (open) {
      setSearch('')
      setPage(1)
    }
  }, [open])

  const refetch = useCallback(async () => {
    if (!open) {
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listMerchCampaigns({
        page,
        limit: PAGE_SIZE,
        q: search.trim() || undefined,
        isEnabled: true,
        isArchived: false,
      })
      if (seq === requestSeq.current) {
        setResult(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setResult(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [open, page, search])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <Alert open={open} onClose={onClose} size="4xl">
      <AlertTitle>انتخاب کمپین</AlertTitle>
      <AlertDescription>
        فقط کمپین‌های فعال و بایگانی‌نشده نمایش داده می‌شوند. این انتخاب
        تنظیمات یا ارتباط‌های کمپین را تغییر نمی‌دهد.
      </AlertDescription>
      <AlertBody>
        <div className="mb-4">
          <InputGroup>
            <Search data-slot="icon" aria-hidden="true" />
            <Input
              type="search"
              aria-label="جستجوی کمپین"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="نام داخلی یا عنوان فارسی"
            />
          </InputGroup>
        </div>

        {loading && !result ? (
          <Loading compact label="در حال بارگذاری کمپین‌ها…" />
        ) : error ? (
          <ErrorState
            size="compact"
            message={translateApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            size="compact"
            title="کمپینی پیدا نشد"
            description="عبارت جستجو را تغییر دهید یا ابتدا کمپین را در بخش کمپین‌ها بسازید."
          />
        ) : (
          <>
            <TablePagination
              position="top"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="کمپین"
            />
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>کمپین</TableHeader>
                  <TableHeader>نوع</TableHeader>
                  <TableHeader>وضعیت</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((campaign) => {
                  const selected = selectedIds.includes(campaign.id)
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {campaign.internalName}
                        </p>
                        <p className="text-xs text-muted">{campaign.titleFa}</p>
                      </TableCell>
                      <TableCell className="text-muted">
                        {MERCH_CAMPAIGN_TYPE_LABELS[campaign.type]}
                      </TableCell>
                      <TableCell>
                        <MerchCampaignStatusBadge status={campaign.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          outline
                          disabled={selected || maxReached}
                          onClick={() => onPick(campaign)}
                        >
                          {selected
                            ? 'افزوده‌شده'
                            : maxReached
                              ? 'محدودیت تکمیل است'
                              : pickLabel}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="کمپین"
            />
          </>
        )}
        <Text className="mt-3 text-xs text-muted">
          فصل‌ها و ترتیب انتخاب در بخش صفحه اصلی حفظ می‌شوند.
        </Text>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose}>
          بستن
        </Button>
      </AlertActions>
    </Alert>
  )
}
