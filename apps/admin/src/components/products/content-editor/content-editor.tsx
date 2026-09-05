import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import clsx from 'clsx'
import { Maximize2, Save, X } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { RichText } from '../../ui/rich-text'
import { translateApiError } from '../../../lib/error-messages'
import { uploadDescriptionImage } from '../../../services/media'
import { DESCRIPTION_MAX_LENGTH } from './content-editor-constants'
import { ProductImage } from './product-image-extension'
import { ContentEditorToolbar } from './content-editor-toolbar'
import { ImagePropertiesPanel } from './image-properties-panel'
import { ImageCropDialog } from './image-crop-dialog'
import { ImageInsertDialog } from './image-insert-dialog'

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
    },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ProductImage,
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
]

type ImageAttrs = {
  src: string
  alt: string
  width: number | null
  align: 'left' | 'center' | 'right'
  caption: string
  href: string | null
}

/**
 * Professional product content editor. Full document workspace with a paper
 * canvas, grouped toolbar, fullscreen mode, preview, and a `figure`-based
 * image node supporting selection, resize, alignment, crop, replacement,
 * movement, captions, alt text and links. Output stays sanitized semantic HTML
 * compatible with the product API and storefront rendering.
 */
export function ContentEditor({
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
  /** Enables image upload/import (edit mode only). */
  productId?: string
  onRequestSave?: () => void
  onRequestCancel?: () => void
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [preview, setPreview] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [crop, setCrop] = useState<{ open: boolean; src: string }>({ open: false, src: '' })
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [charCount, setCharCount] = useState(0)
  const [, setRenderTick] = useState(0)

  const editor = useEditor({
    extensions,
    content: value || '',
    editorProps: {
      attributes: { class: 'rich-text content-editor-canvas' },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
      setCharCount(editor.getHTML().length)
    },
  })

  // TipTap v3's useEditor does not re-render the host on transactions; force a
  // re-render so toolbar active states and the image selection panel stay live
  // (content changes, selection changes and image attribute updates).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const handler = (): void => setRenderTick((value) => value + 1)
    editor.on('transaction', handler)
    return () => {
      editor.off('transaction', handler)
    }
  }, [editor])

  // Populate from external value (e.g. after the edit product loads) without
  // clobbering user typing; guards make this safe under React StrictMode.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.schema) return
    if (editor.getHTML() !== (value || '')) {
      editor.commands.setContent(value || '', { emitUpdate: false })
      setCharCount(editor.getHTML().length)
    }
  }, [editor, value])

  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.schema) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  // Escape exits fullscreen and preview.
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setFullscreen(false)
        setPreview(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Lock body scroll while fullscreen.
  useEffect(() => {
    if (!fullscreen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [fullscreen])

  const imageSelected = Boolean(editor?.isActive('image'))
  const imageAttrs = imageSelected
    ? (editor?.getAttributes('image') as unknown as ImageAttrs | undefined)
    : null

  const insertImage = (url: string): void => {
    editor?.chain().focus().setImage({ src: url, alt: '' }).run()
    setInsertOpen(false)
  }

  const uploadAndApply = async (
    file: File,
    apply: (url: string) => void,
  ): Promise<void> => {
    if (!productId) return
    setImageBusy(true)
    setImageError(null)
    try {
      const result = await uploadDescriptionImage(productId, file)
      apply(result.url)
    } catch (error) {
      setImageError(translateApiError(error))
    } finally {
      setImageBusy(false)
    }
  }

  const handleReplace = (file: File): void => {
    void uploadAndApply(file, (url) => {
      editor?.chain().focus().updateAttributes('image', { src: url }).run()
    })
  }

  const handleCropApply = async (blob: Blob): Promise<void> => {
    await uploadAndApply(
      new File([blob], 'crop.jpg', { type: blob.type }),
      (url) => {
        editor?.chain().focus().updateAttributes('image', { src: url }).run()
        setCrop({ open: false, src: '' })
      },
    )
  }

  const overLimit = charCount > maxLength

  const toolbar = (
    <ContentEditorToolbar
      editor={editor as NonNullable<typeof editor>}
      disabled={disabled}
      fullscreen={fullscreen}
      preview={preview}
      onInsertImage={() => (productId ? setInsertOpen(true) : undefined)}
      onToggleFullscreen={() => setFullscreen((value) => !value)}
      onTogglePreview={() => setPreview((value) => !value)}
    />
  )

  const imagePanel = imageSelected && imageAttrs && !preview ? (
    <div className="px-3 py-3 sm:px-4">
      <ImagePropertiesPanel
        editor={editor as NonNullable<typeof editor>}
        attrs={imageAttrs}
        disabled={disabled || imageBusy || !productId}
        onOpenCrop={(src) => setCrop({ open: true, src })}
        onReplaceFile={handleReplace}
      />
    </div>
  ) : null

  const statusLine = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-3">
        {imageBusy && (
          <span className="flex items-center gap-2 text-xs text-primary">
            <span
              aria-hidden="true"
              className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            در حال بارگذاری تصویر…
          </span>
        )}
        {imageError && <span className="text-xs text-danger">{imageError}</span>}
        <Text className="text-xs text-muted">
          محتوا پس از ذخیره در سمت سرور پاکسازی و با امنیت نمایش داده میشود.
        </Text>
      </div>
      <Text className={clsx('text-xs', overLimit ? 'text-danger' : 'text-muted')} dir="ltr">
        {charCount} / {maxLength}
      </Text>
    </div>
  )

  const canvas = preview ? (
    <div className="px-4 py-6 sm:px-8">
      <RichText html={editor?.getHTML() ?? value} />
    </div>
  ) : (
    <div className="px-3 py-4 sm:px-6 sm:py-6">
      <EditorContent editor={editor} />
    </div>
  )

  const editorBody = (
    <>
      {toolbar}
      {imagePanel}
      {canvas}
      {statusLine}
    </>
  )

  const inline = (
    <div className="overflow-hidden rounded-xl border border-border bg-surface focus-within:border-primary/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2">
        <p className="text-sm font-semibold text-foreground">توضیح کامل محصول</p>
        <div className="flex items-center gap-1.5">
          <Button outline onClick={() => setPreview((value) => !value)} title="پیشنمایش">
            {preview ? 'ویرایش' : 'پیشنمایش'}
          </Button>
          <Button outline onClick={() => setFullscreen(true)} title="تمامصفحه">
            <Maximize2 data-slot="icon" />
            تمامصفحه
          </Button>
        </div>
      </div>
      {editorBody}
    </div>
  )

  const fullscreenChrome = editor && (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="ویرایشگر تمامصفحه">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-glass px-3 py-2.5 backdrop-blur-md sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button outline onClick={() => setFullscreen(false)} title="خروج از تمامصفحه">
            <X data-slot="icon" />
            <span className="hidden sm:inline">خروج</span>
          </Button>
          <p className="truncate text-sm font-semibold text-foreground">توضیح کامل محصول</p>
        </div>
        <div className="flex items-center gap-2">
          {onRequestCancel && (
            <Button outline onClick={onRequestCancel} disabled={disabled}>
              انصراف
            </Button>
          )}
          {onRequestSave && (
            <Button color="primary" onClick={onRequestSave} disabled={disabled}>
              <Save data-slot="icon" />
              ذخیره
            </Button>
          )}
        </div>
      </header>
      <ContentEditorToolbar
        editor={editor}
        disabled={disabled}
        fullscreen
        preview={preview}
        onInsertImage={() => (productId ? setInsertOpen(true) : undefined)}
        onToggleFullscreen={() => setFullscreen(false)}
        onTogglePreview={() => setPreview((value) => !value)}
      />
      {imagePanel}
      <div className="flex-1 overflow-y-auto bg-surface-strong/40">
        <div className="px-4 py-8 sm:px-8 sm:py-10">
          <div className="rounded-lg border border-border bg-background shadow-sm">
            {preview ? (
              <div className="px-6 py-8 sm:px-10">
                <RichText html={editor.getHTML()} />
              </div>
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-border bg-background">{statusLine}</div>
    </div>
  )

  return (
    <>
      {/* The TipTap editor instance is mounted in exactly one EditorContent at
          a time. TipTap v3 moves the single ProseMirror view DOM into the
          container of whichever EditorContent mounts; rendering both inline
          and portaled copies would leave the view detached (invisible) once
          the fullscreen portal unmounts. */}
      {fullscreen ? null : inline}
      {fullscreen && fullscreenChrome
        ? createPortal(fullscreenChrome, document.body)
        : null}

      {insertOpen && productId && (
        <ImageInsertDialog
          open
          productId={productId}
          onClose={() => setInsertOpen(false)}
          onInsert={insertImage}
        />
      )}

      <ImageCropDialog
        open={crop.open}
        src={crop.src}
        busy={imageBusy}
        onClose={() => setCrop({ open: false, src: '' })}
        onApply={(blob) => void handleCropApply(blob)}
      />
    </>
  )
}