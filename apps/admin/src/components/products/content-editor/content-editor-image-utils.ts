/** Minimum/maximum image width in px for the description editor. */
export const IMAGE_MIN_WIDTH = 40
export const IMAGE_MAX_WIDTH = 2000

export type ImageAlign = 'left' | 'center' | 'right'

export interface ImageAttributes {
  src: string
  alt: string
  width: number | null
  align: ImageAlign
  caption: string
  href: string | null
}

export interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

/** Clamps an image width to the supported bounds. */
export function clampImageWidth(value: number, max = IMAGE_MAX_WIDTH): number {
  if (!Number.isFinite(value)) return IMAGE_MIN_WIDTH
  return Math.min(max, Math.max(IMAGE_MIN_WIDTH, Math.round(value)))
}

/**
 * Returns a sensible width for an inserted image: the natural width clamped
 * into bounds (images are never stored at their intrinsic size if they exceed
 * the document column).
 */
export function suggestedImageWidth(
  naturalWidth: number | undefined,
  max = IMAGE_MAX_WIDTH,
): number {
  const width = naturalWidth && naturalWidth > 0 ? naturalWidth : 720
  return clampImageWidth(width, max)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolvePromise, rejectPromise) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolvePromise(image)
    image.onerror = () => rejectPromise(new Error('image load failed'))
    image.src = src
  })
}

/**
 * Crops the image at `src` to the given pixel area and returns the resulting
 * blob. This is a real pixel crop (canvas) — not a CSS object-fit trick. The
 * source must be same-origin (our description-image storage) so the canvas is
 * not tainted; external cross-origin images must be imported first.
 */
export async function cropImageBlob(
  src: string,
  crop: PixelCrop,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg',
  quality = 0.92,
): Promise<Blob | null> {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(crop.width))
  canvas.height = Math.max(1, Math.round(crop.height))
  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return new Promise((resolvePromise) => {
    canvas.toBlob((blob) => resolvePromise(blob), mimeType, quality)
  })
}