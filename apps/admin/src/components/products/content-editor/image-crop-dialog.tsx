import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import type { Area, Point } from 'react-easy-crop'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { cropImageBlob } from './content-editor-image-utils'

type AspectPreset = 'free' | '1:1' | '4:3' | '16:9'

const ASPECT_PRESETS: Array<{ value: AspectPreset; label: string; ratio?: number }> = [
  { value: 'free', label: 'آزاد' },
  { value: '1:1', label: 'مربع (۱:۱)', ratio: 1 },
  { value: '4:3', label: '۴:۳', ratio: 4 / 3 },
  { value: '16:9', label: '۱۶:۹', ratio: 16 / 9 },
]

/**
 * Real pixel-crop workflow for a selected description image. The image is shown
 * in a cropper; on apply the cropped area is drawn to a canvas and returned as
 * a blob (the caller uploads it through the existing storage pipeline). This is
 * a genuine crop, not a CSS object-fit trick.
 */
export function ImageCropDialog({
  open,
  src,
  busy,
  onClose,
  onApply,
}: {
  open: boolean
  src: string
  busy: boolean
  onClose: () => void
  onApply: (blob: Blob) => void
}) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [aspect, setAspect] = useState<AspectPreset>('free')
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setAspect('free')
      setPixelCrop(null)
      setError(null)
    }
  }, [open])

  const applyCrop = async (): Promise<void> => {
    if (!pixelCrop) {
      setError('ناحیه برش مشخص نشده است.')
      return
    }
    try {
      const blob = await cropImageBlob(src, pixelCrop)
      if (!blob) {
        setError('برش تصویر ناموفق بود.')
        return
      }
      onApply(blob)
    } catch {
      setError('برش تصویر ناموفق بود. برای تصاویر خارجی ابتدا آن را جایگزین یا وارد کنید.')
    }
  }

  return (
    <Alert open={open} onClose={busy ? () => undefined : onClose} size="3xl">
      <AlertTitle>برش تصویر</AlertTitle>
      <AlertDescription>
        ناحیه موردنظر را انتخاب کنید و در پایان «اعمال برش» را بزنید.
      </AlertDescription>
      <AlertBody>
        <div className="flex flex-wrap items-center gap-2">
          {ASPECT_PRESETS.map((preset) =>
            aspect === preset.value ? (
              <Button key={preset.value} color="primary" onClick={() => setAspect(preset.value)} disabled={busy}>
                {preset.label}
              </Button>
            ) : (
              <Button key={preset.value} outline onClick={() => setAspect(preset.value)} disabled={busy}>
                {preset.label}
              </Button>
            ),
          )}
        </div>
        <div className="relative mt-4 h-[24rem] overflow-hidden rounded-lg bg-surface-strong sm:h-[28rem]">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT_PRESETS.find((preset) => preset.value === aspect)?.ratio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, pixels) => setPixelCrop(pixels)}
            showGrid={aspect === 'free'}
            zoomWithScroll
          />
        </div>
        {error && (
          <p className="mt-3 danger-box rounded-lg px-3 py-2 text-sm">{error}</p>
        )}
        <Text className="mt-3 text-xs text-muted">
          در صورت بروز مشکل با تصاویر پیوندی خارجی، ابتدا تصویر را جایگزین کنید.
        </Text>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose} disabled={busy}>
          انصراف
        </Button>
        <Button color="primary" onClick={() => void applyCrop()} disabled={busy || !pixelCrop}>
          {busy ? 'در حال اعمال…' : 'اعمال برش'}
        </Button>
      </AlertActions>
    </Alert>
  )
}