import { ContentEditor } from './content-editor/content-editor'
import { DESCRIPTION_MAX_LENGTH } from './content-editor/content-editor-constants'

export { DESCRIPTION_MAX_LENGTH }

/**
 * Lazy-loaded entry for the product long-description content editor. Kept as a
 * thin wrapper so the existing import path (and its route-level code-splitting)
 * stays stable; all editor logic lives in `content-editor/`.
 */
export function ProductDescriptionEditor({
  value,
  onChange,
  disabled = false,
  maxLength = DESCRIPTION_MAX_LENGTH,
  productId,
  onRequestSave,
  onRequestCancel,
}: {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  maxLength?: number
  /** Enables inline image upload/import (edit mode only). */
  productId?: string
  /** Shown in the fullscreen header (e.g. the product save/cancel actions). */
  onRequestSave?: () => void
  onRequestCancel?: () => void
}) {
  return (
    <ContentEditor
      value={value}
      onChange={onChange}
      disabled={disabled}
      maxLength={maxLength}
      productId={productId}
      onRequestSave={onRequestSave}
      onRequestCancel={onRequestCancel}
    />
  )
}