import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePartnerDetail } from '../hooks/use-partner-detail'
import { useTiers } from '../hooks/use-tiers'
import { translateApiError } from '../lib/error-messages'
import { formatDateTime, formatFileSize } from '../lib/format'
import { PARTNER_DOCUMENT_TYPE_LABELS } from '../lib/partner-labels'
import { downloadPartnerDocument } from '../services/partners'
import { ApproveDialog } from '../components/partners/approve-dialog'
import { DocumentPreviewDialog } from '../components/partners/document-preview-dialog'
import { RejectDialog } from '../components/partners/reject-dialog'
import { StatusBadge } from '../components/partners/status-badge'
import { TierChangeDialog } from '../components/partners/tier-change-dialog'
import { Button } from '../components/catalyst/button'
import { Heading } from '../components/catalyst/heading'
import { Subheading } from '../components/catalyst/heading'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table'
import { Text } from '../components/catalyst/text'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import type { PartnerDocumentSummary } from '@sabz/types'

type DialogName = 'approve' | 'reject' | 'tier'

function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-dust-200">{label}</dt>
      <dd className="text-sm text-foreground">{value || '—'}</dd>
    </div>
  )
}

export function PartnerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { partner, loading, error, refetch } = usePartnerDetail(id ?? '')
  const { tiers, loading: tiersLoading, error: tiersError, refetch: refetchTiers } = useTiers()
  const [dialog, setDialog] = useState<DialogName | null>(null)
  const [previewDocument, setPreviewDocument] = useState<PartnerDocumentSummary | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading && !partner) {
    return <Loading label="در حال بارگذاری درخواست…" />
  }

  if (error && !partner) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-white px-6 py-16 text-center">
          <p className="text-sm/6 text-dust-200">{translateApiError(error)}</p>
          <Button color="primary" onClick={() => void refetch()}>
            تلاش مجدد
          </Button>
          <Link to="/partners" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست درخواستها
          </Link>
        </div>
      </div>
    )
  }

  if (!partner) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <EmptyState
          title="درخواست یافت نشد"
          description="این درخواست همکاری در دسترس نیست."
          actions={
            <Link to="/partners">
              <Button outline>بازگشت به فهرست</Button>
            </Link>
          }
        />
      </div>
    )
  }

  const handleSuccess = (): void => {
    setDialog(null)
    void refetch()
  }

  const handleDownload = async (document: PartnerDocumentSummary): Promise<void> => {
    try {
      const blob = await downloadPartnerDocument(partner.id, document.id)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = document.originalName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setActionError(translateApiError(error))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <Link to="/partners" className="text-sm font-medium text-primary hover:underline">
            بازگشت به فهرست درخواستها
          </Link>
          <div className="flex items-center gap-3">
            <Heading level={1}>{partner.businessName}</Heading>
            <StatusBadge status={partner.approvalStatus} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {partner.approvalStatus === 'PENDING' && (
            <>
              <Button outline onClick={() => setDialog('reject')}>
                رد درخواست
              </Button>
              <Button color="primary" onClick={() => setDialog('approve')}>
                تأیید درخواست
              </Button>
            </>
          )}
          {partner.approvalStatus === 'APPROVED' && (
            <Button color="primary" onClick={() => setDialog('tier')}>
              تغییر تایر
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>اطلاعات کسبوکار</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="نام کسبوکار" value={partner.businessName} />
            <InfoItem label="شماره جواز کسب" value={partner.businessLicenseNo} />
            <InfoItem label="کد ملی" value={partner.nationalId} />
            <InfoItem label="وبسایت" value={partner.website} />
            <InfoItem label="استان" value={partner.province} />
            <InfoItem label="شهر" value={partner.city} />
            <div className="sm:col-span-2">
              <InfoItem label="نشانی" value={partner.address} />
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>متقاضی</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <InfoItem label="نام" value={partner.profile.firstName} />
            <InfoItem label="نام خانوادگی" value={partner.profile.lastName} />
            <InfoItem label="موبایل" value={partner.profile.mobile} />
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>زندگی درخواست</Subheading>
          <dl className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <StatusBadge status={partner.approvalStatus} />
            </div>
            <InfoItem label="تاریخ ثبت" value={formatDateTime(partner.submittedAt)} />
            <InfoItem label="تاریخ تأیید" value={formatDateTime(partner.approvedAt)} />
            <InfoItem label="تاریخ رد" value={formatDateTime(partner.rejectedAt)} />
            <InfoItem label="دلیل رد" value={partner.rejectionReason} />
            <InfoItem label="یادداشت بررسی" value={partner.reviewNotes} />
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-white p-6">
          <Subheading>تایر</Subheading>
          {partner.tier ? (
            <div className="mt-4 space-y-2">
              <p className="text-base font-semibold text-foreground">{partner.tier.name}</p>
              <Text>تخفیف: {partner.tier.discountPercent}٪</Text>
              <Text>حداقل سفارش: {partner.tier.minOrderQuantity}</Text>
            </div>
          ) : (
            <Text className="mt-4">هنوز تایری برای این درخواست تعیین نشده است.</Text>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-border bg-white p-6">
        <Subheading>مدارک</Subheading>
        {actionError && (
          <Text className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {actionError}
          </Text>
        )}
        {partner.documents.length === 0 ? (
          <Text className="mt-4">سندی بارگذاری نشده است.</Text>
        ) : (
          <div className="mt-4">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>نوع سند</TableHeader>
                  <TableHeader>نام فایل</TableHeader>
                  <TableHeader>نوع فایل</TableHeader>
                  <TableHeader>حجم</TableHeader>
                  <TableHeader>تاریخ بارگذاری</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {partner.documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium text-zinc-950">
                      {PARTNER_DOCUMENT_TYPE_LABELS[document.type]}
                    </TableCell>
                    <TableCell className="text-zinc-500">{document.originalName}</TableCell>
                    <TableCell className="text-zinc-500">{document.mimeType}</TableCell>
                    <TableCell className="text-zinc-500">
                      {formatFileSize(document.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDateTime(document.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button plain onClick={() => setPreviewDocument(document)}>
                          پیش‌نمایش
                        </Button>
                        <Button plain onClick={() => void handleDownload(document)}>
                          دانلود
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <ApproveDialog
        open={dialog === 'approve'}
        partner={partner}
        tiers={tiers}
        tiersLoading={tiersLoading}
        tiersError={tiersError}
        onRetryTiers={() => void refetchTiers()}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
      />
      <RejectDialog
        open={dialog === 'reject'}
        partner={partner}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
      />
      <TierChangeDialog
        open={dialog === 'tier'}
        partner={partner}
        tiers={tiers}
        tiersLoading={tiersLoading}
        tiersError={tiersError}
        onRetryTiers={() => void refetchTiers()}
        onClose={() => setDialog(null)}
        onSuccess={handleSuccess}
      />
      <DocumentPreviewDialog
        open={previewDocument !== null}
        partnerId={partner.id}
        document={previewDocument}
        onClose={() => setPreviewDocument(null)}
      />
    </div>
  )
}