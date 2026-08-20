import { useState } from 'react'
import type { ProductMediaSummary, VariantSummary } from '@sabz/types'
import { Subheading } from '../catalyst/heading'
import { Text } from '../catalyst/text'
import { Button } from '../catalyst/button'
import { Badge } from '../catalyst/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../catalyst/table'
import { PRODUCT_MEDIA_TYPE_LABELS } from '../../lib/product-labels'
import { formatDateTime, formatFileSize } from '../../lib/format'
import { translateApiError } from '../../lib/error-messages'
import { downloadProductMedia } from '../../services/media'
import { MediaUploadDialog } from '../media/media-upload-dialog'
import { MediaPreviewDialog } from '../media/media-preview-dialog'
import { MediaDeleteDialog } from '../media/media-delete-dialog'

type MediaDialogState =
  | { type: 'upload' }
  | { type: 'preview' | 'delete'; media: ProductMediaSummary }
  | null

function MediaTypeBadge({ mediaType }: { mediaType: ProductMediaSummary['mediaType'] }) {
  return (
    <Badge color={mediaType === 'IMAGE' ? 'emerald' : 'sky'}>
      {PRODUCT_MEDIA_TYPE_LABELS[mediaType]}
    </Badge>
  )
}

export function ProductMediaSection({
  media,
  variants,
  productId,
  manageable,
  onRefetch,
}: {
  media: ProductMediaSummary[]
  variants: VariantSummary[]
  productId: string
  manageable: boolean
  onRefetch: () => void
}) {
  const [dialog, setDialog] = useState<MediaDialogState>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const hasVariantAssociation = media.some((item) => item.variantId !== null)

  const handleDownload = async (item: ProductMediaSummary): Promise<void> => {
    try {
      const blob = await downloadProductMedia(productId, item.id)
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = item.originalName
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setActionError(null)
    } catch (error) {
      setActionError(translateApiError(error))
    }
  }

  const handleUploadSuccess = (): void => {
    setDialog(null)
    setActionError(null)
    onRefetch()
  }

  const handleRefetch = (): void => {
    setActionError(null)
    onRefetch()
  }

  const selectedMedia = dialog?.type === 'preview' || dialog?.type === 'delete' ? dialog.media : null

  return (
    <section className="rounded-lg border border-border bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Subheading>رسانهها</Subheading>
          <Text className="mt-1 text-xs text-zinc-500">
            رسانهها به ترتیب تعیینشده توسط سرور نمایش داده میشوند؛ اولین تصویر بارگذاریشده بهصورت
            خودکار تصویر اصلی میشود.
          </Text>
        </div>
        {manageable && (
          <Button color="primary" onClick={() => setDialog({ type: 'upload' })}>
            افزودن رسانه
          </Button>
        )}
      </div>

      {actionError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {media.length === 0 ? (
        <Text className="mt-4">رسانهای برای این محصول ثبت نشده است.</Text>
      ) : (
        <div className="mt-4">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>نام فایل</TableHeader>
                <TableHeader>نوع</TableHeader>
                <TableHeader>MIME</TableHeader>
                <TableHeader>حجم</TableHeader>
                <TableHeader>ترتیب</TableHeader>
                {hasVariantAssociation && <TableHeader>واریانت</TableHeader>}
                <TableHeader>اصلی</TableHeader>
                <TableHeader>تاریخ ایجاد</TableHeader>
                <TableHeader>عملیات</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {media.map((item) => {
                const variant = item.variantId
                  ? variants.find((v) => v.id === item.variantId)
                  : undefined
                return (
                  <TableRow key={item.id}>
                    <TableCell dir="ltr" className="font-medium text-zinc-950">
                      {item.originalName}
                    </TableCell>
                    <TableCell>
                      <MediaTypeBadge mediaType={item.mediaType} />
                    </TableCell>
                    <TableCell dir="ltr" className="text-zinc-500">
                      {item.mimeType}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatFileSize(item.sizeBytes)}
                    </TableCell>
                    <TableCell className="text-zinc-500">{item.sortOrder}</TableCell>
                    {hasVariantAssociation && (
                      <TableCell dir="ltr" className="text-zinc-500">
                        {variant ? (variant.name ? `${variant.sku} — ${variant.name}` : variant.sku) : '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      {item.isPrimary ? (
                        <Badge color="amber">تصویر اصلی</Badge>
                      ) : (
                        <span className="text-zinc-500">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-500">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button outline onClick={() => setDialog({ type: 'preview', media: item })}>
                          مشاهده
                        </Button>
                        <Button outline onClick={() => void handleDownload(item)}>
                          دانلود
                        </Button>
                        {manageable && (
                          <Button outline onClick={() => setDialog({ type: 'delete', media: item })}>
                            حذف
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <MediaUploadDialog
        open={dialog?.type === 'upload'}
        productId={productId}
        variants={variants}
        onClose={() => setDialog(null)}
        onSuccess={handleUploadSuccess}
        onConflict={handleRefetch}
      />

      <MediaPreviewDialog
        open={dialog?.type === 'preview'}
        productId={productId}
        media={selectedMedia}
        onClose={() => setDialog(null)}
      />

      <MediaDeleteDialog
        open={dialog?.type === 'delete'}
        media={selectedMedia}
        onClose={() => setDialog(null)}
        onRefetch={handleRefetch}
      />
    </section>
  )
}