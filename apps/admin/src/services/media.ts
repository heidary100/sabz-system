import type { ProductMediaSummary } from '@sabz/types'
import { request, requestBlob, requestMultipart } from './api'

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