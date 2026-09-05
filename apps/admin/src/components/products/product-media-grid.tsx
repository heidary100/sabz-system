import { useEffect, useState } from 'react'
import type { ProductMediaSummary, VariantSummary } from '@sabz/types'
import { Download, Eye, FileVideo, Plus, Trash2 } from 'lucide-react'
import { Badge } from '../catalyst/badge'
import { Button } from '../catalyst/button'
import { Text } from '../catalyst/text'
import { formatFileSize } from '../../lib/format'
import { translateApiError } from '../../lib/error-messages'
import { downloadProductMedia } from '../../services/media'
import { MediaUploadDialog } from '../media/media-upload-dialog'
import { MediaPreviewDialog } from '../media/media-preview-dialog'
import { MediaDeleteDialog } from '../media/media-delete-dialog'

type MediaDialogState =
  | { type: 'upload' }
  | { type: 'preview' | 'delete'; media: ProductMediaSummary }
  | null

/** Loads preview thumbnails for product images (blob → object URL). */
function useImageThumbnails(productId: string, media: ProductMediaSummary[]) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    const urls: string[] = []
    const load = async (): Promise<void> => {
      const next: Record<string, string> = {}
      const nextFailed: Record<string, boolean> = {}
      for (const item of media) {
        if (item.mediaType !== 'IMAGE') continue
        try {
          const blob = await downloadProductMedia(productId, item.id)
          if (cancelled) return
          const url = URL.createObjectURL(blob)
          urls.push(url)
          next[item.id] = url
        } catch {
          nextFailed[item.id] = true
        }
      }
      if (!cancelled) {
        setThumbnails(next)
        setFailed(nextFailed)
      }
    }
    void load()
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [productId, media])

  return { thumbnails, failed }
}

function MediaCard({
  item,
  thumbnail,
  failed,
  variant,
  manageable,
  onPreview,
  onDownload,
  onDelete,
}: {
  item: ProductMediaSummary
  thumbnail?: string
  failed?: boolean
  variant?: VariantSummary
  manageable: boolean
  onPreview: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const isImage = item.mediaType === 'IMAGE'
  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-surface">
      <div className="relative aspect-square bg-surface-strong">
        {isImage ? (
          thumbnail ? (
            <img src={thumbnail} alt={item.originalName} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted">
              {failed ? 'عدم دسترسی' : 'در حال بارگذاری…'}
            </div>
          )
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
            <FileVideo className="size-8" />
            <span className="text-xs">ویدئو</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-1 p-2">
          {item.isPrimary ? (
            <Badge color="amber">تصویر اصلی</Badge>
          ) : (
            <span />
          )}
        </div>
        {variant && (
          <div className="absolute bottom-2 start-2">
            <Badge color="zinc" className="max-w-[10rem] truncate" dir="ltr">
              {variant.name ? `${variant.sku} — ${variant.name}` : variant.sku}
            </Badge>
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <p dir="ltr" className="truncate text-left text-xs text-muted" title={item.originalName}>
          {item.originalName}
        </p>
        <p className="text-xs text-muted">
          <span dir="ltr">{item.mimeType}</span> · {formatFileSize(item.sizeBytes)}
        </p>
        <div className="flex items-center gap-1.5">
          <Button outline onClick={onPreview}>
            <Eye data-slot="icon" />
            مشاهده
          </Button>
          <Button outline onClick={onDownload}>
            <Download data-slot="icon" />
          </Button>
          {manageable && (
            <Button outline onClick={onDelete}>
              <Trash2 data-slot="icon" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Visual media workspace for the full-page product editor: image thumbnails and
 * video cards with primary/variant badges, plus upload/preview/delete dialogs.
 * Keeps the existing server semantics (first uploaded image becomes primary;
 * primary promotion on delete).
 */
export function ProductMediaGrid({
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
  const { thumbnails, failed } = useImageThumbnails(productId, media)

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

  const selectedMedia =
    dialog?.type === 'preview' || dialog?.type === 'delete' ? dialog.media : null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text className="text-xs text-muted">
          تصاویر و ویدئوهای محصول. اولین تصویر بارگذاری شده به صورت خودکار تصویر اصلی میشود و پس از
          بارگذاری، واترمارک برند (لوگو و نام شرکت) به صورت خودکار روی رسانه اعمال میشود.
        </Text>
        {manageable && (
          <Button color="primary" onClick={() => setDialog({ type: 'upload' })}>
            <Plus data-slot="icon" />
            افزودن رسانه
          </Button>
        )}
      </div>

      {actionError && (
        <p className="mt-4 danger-box rounded-lg px-3 py-2 text-sm">{actionError}</p>
      )}

      {media.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
          <Text className="text-muted">رسانهای ثبت نشده است؛ نخستین تصویر، تصویر اصلی میشود.</Text>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item) => {
            const variant = item.variantId
              ? variants.find((v) => v.id === item.variantId)
              : undefined
            return (
              <MediaCard
                key={item.id}
                item={item}
                thumbnail={thumbnails[item.id]}
                failed={failed[item.id]}
                variant={variant}
                manageable={manageable}
                onPreview={() => setDialog({ type: 'preview', media: item })}
                onDownload={() => void handleDownload(item)}
                onDelete={() => setDialog({ type: 'delete', media: item })}
              />
            )
          })}
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
    </div>
  )
}