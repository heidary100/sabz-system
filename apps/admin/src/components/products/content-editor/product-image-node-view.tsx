import { useRef } from 'react'
import clsx from 'clsx'
import { NodeViewWrapper } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/react'
import { clampImageWidth, IMAGE_MIN_WIDTH } from './content-editor-image-utils'

/**
 * React node view for the product description image. Renders the
 * `figure`-based image block, a selection ring, and an interactive corner
 * resize handle that updates the node's `width` attribute (aspect ratio is
 * preserved because only width is stored and height stays `auto`). Block-level
 * dragging (ProseMirror) moves the image within the document flow.
 */
export function ProductImageNodeView({
  node,
  updateAttributes,
  selected,
  editor,
}: {
  node: ProseMirrorNode
  updateAttributes: (attributes: Record<string, unknown>) => void
  selected: boolean
  editor: Editor
}) {
  const containerRef = useRef<HTMLElement>(null)
  const attrs = node.attrs as {
    src: string
    alt: string
    width: number | null
    align: string
    caption: string
    href: string | null
  }

  const startResize = (event: React.PointerEvent): void => {
    if (!editor.isEditable) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = attrs.width ?? 0
    const containerWidth = containerRef.current?.clientWidth ?? 0
    const max =
      containerWidth > 0
        ? Math.max(IMAGE_MIN_WIDTH, Math.round(containerWidth))
        : undefined

    const onMove = (moveEvent: PointerEvent): void => {
      const next = clampImageWidth(startWidth + (moveEvent.clientX - startX), max)
      updateAttributes({ width: next })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
  }

  return (
    <NodeViewWrapper
      as="figure"
      ref={containerRef}
      contentEditable={false}
      draggable
      data-type="product-image"
      data-align={attrs.align || 'center'}
      data-width={attrs.width ?? undefined}
      className={clsx(
        'product-image-node group relative my-4',
        selected && 'product-image-selected',
      )}
    >
      {attrs.href ? (
        <a
          href={attrs.href}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
        >
          <img
            src={attrs.src}
            alt={attrs.alt || 'تصویر'}
            width={attrs.width ?? undefined}
            loading="lazy"
            className="product-image-node-img"
          />
        </a>
      ) : (
        <img
          src={attrs.src}
          alt={attrs.alt || 'تصویر'}
          width={attrs.width ?? undefined}
          loading="lazy"
          className="product-image-node-img"
        />
      )}
      {attrs.caption ? (
        <figcaption className="product-image-node-caption">{attrs.caption}</figcaption>
      ) : null}
      {selected && (
        <button
          type="button"
          aria-label="تغییر اندازه تصویر"
          title="کشیدن برای تغییر اندازه"
          onPointerDown={startResize}
          className="product-image-resize-handle"
        />
      )}
    </NodeViewWrapper>
  )
}