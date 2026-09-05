import type { ProductMediaSummary } from '@sabz/types'
import { request, requestBlob, requestMultipart, requestMultipartWithProgress } from './api'

export interface DescriptionImageUploadResult {
  id: string
  url: string
}

export function uploadDescriptionImage(
  productId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<DescriptionImageUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  return requestMultipartWithProgress<DescriptionImageUploadResult>(
    `/admin/products/${productId}/description-images`,
    formData,
    onProgress,
  )
}

/**
 * Imports an external image URL into controlled (watermarked) description-image
 * storage and returns the controlled URL. External URLs are never referenced
 * directly, so they cannot bypass the media/branding policy or be cropped.
 */
export function importDescriptionImageFromUrl(
  productId: string,
  url: string,
): Promise<DescriptionImageUploadResult> {
  return request<DescriptionImageUploadResult>(
    `/admin/products/${productId}/description-images/from-url`,
    { method: 'POST', body: JSON.stringify({ url }) },
  )
}

export function uploadProductMedia(
  productId: string,
  file: File,
  options?: { variantId?: string },
): Promise<ProductMediaSummary> {
  const formData = new FormData()
  formData.append('file', file)
  if (options?.variantId) {
    formData.append('variantId', options.variantId)
  }
  return requestMultipart<ProductMediaSummary>(
    `/admin/products/${productId}/media`,
    formData,
  )
}

/**
 * Uploads media with client-side upload progress reporting. The backend
 * processes (watermarks) the file synchronously after the body uploads, so the
 * caller shows `onProgress` for the upload phase and an indeterminate
 * "processing" state until the promise settles.
 */
export function uploadProductMediaWithProgress(
  productId: string,
  file: File,
  onProgress: (percent: number) => void,
  options?: { variantId?: string },
): Promise<ProductMediaSummary> {
  const formData = new FormData()
  formData.append('file', file)
  if (options?.variantId) {
    formData.append('variantId', options.variantId)
  }
  return requestMultipartWithProgress<ProductMediaSummary>(
    `/admin/products/${productId}/media`,
    formData,
    onProgress,
  )
}

export function listProductMedia(productId: string): Promise<ProductMediaSummary[]> {
  return request<ProductMediaSummary[]>(`/admin/products/${productId}/media`)
}

export function downloadProductMedia(
  productId: string,
  mediaId: string,
): Promise<Blob> {
  return requestBlob(`/admin/products/${productId}/media/${mediaId}`)
}

export function deleteProductMedia(
  mediaId: string,
): Promise<{ removed: boolean }> {
  return request<{ removed: boolean }>(`/admin/media/${mediaId}`, {
    method: 'DELETE',
  })
}