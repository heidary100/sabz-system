import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ProductImageNodeView } from './product-image-node-view'
import { moveImageBlock } from './image-move-command'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      /** Insert a product description image at the current selection. */
      setImage: (options: { src: string; alt?: string }) => ReturnType
      /** Move the selected image to the previous block. */
      moveImageUp: () => ReturnType
      /** Move the selected image to the next block. */
      moveImageDown: () => ReturnType
    }
  }
}

export interface ProductImageAttributes {
  src: string
  alt: string
  width: number | null
  align: 'left' | 'center' | 'right'
  caption: string
  href: string | null
}

/**
 * Product description image node — a `figure`-based image block serialized to
 * semantic HTML:
 *
 *   <figure data-align="center" data-width="720">
 *     <a href="…" target="_blank" rel="noopener noreferrer">  (optional)
 *     <img src="…" alt="…" width="720" loading="lazy">
 *     </a>
 *     <figcaption>Caption</figcaption>                         (optional)
 *   </figure>
 *
 * Alignment/width travel as validated data attributes; the caption and link
 * stay attached to the node. Parsing accepts both the new `figure` form and
 * bare `<img>` tags (backward compatible with existing descriptions). The node
 * view renders selection state and an interactive resize handle.
 */
export const ProductImage = Node.create({
  name: 'image',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addOptions() {
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: '',
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('data-width') ?? element.getAttribute('width')
          const parsed = width ? Number(width) : NaN
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null
        },
        renderHTML: (attributes) =>
          attributes.width ? { 'data-width': String(attributes.width), width: String(attributes.width) } : {},
      },
      align: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-align') || 'center',
        renderHTML: (attributes) => (attributes.align ? { 'data-align': attributes.align } : {}),
      },
      caption: {
        default: '',
        parseHTML: (element) => {
          const caption = element.querySelector('figcaption')
          return caption?.textContent ?? ''
        },
        renderHTML: () => ({}),
      },
      href: {
        default: null,
        parseHTML: (element) => {
          const anchor = element.tagName === 'A' ? element : element.querySelector('a')
          return anchor?.getAttribute('href') ?? null
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure',
        getAttrs: (element) => {
          const figure = element as HTMLElement
          const image = figure.querySelector('img')
          const anchor = figure.querySelector('a')
          const caption = figure.querySelector('figcaption')
          const width =
            figure.getAttribute('data-width') ?? image?.getAttribute('width')
          const parsedWidth = width ? Number(width) : NaN
          return {
            src: image?.getAttribute('src') ?? null,
            alt: image?.getAttribute('alt') ?? '',
            width: Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : null,
            align: figure.getAttribute('data-align') || 'center',
            caption: caption?.textContent ?? '',
            href: anchor?.getAttribute('href') ?? null,
          }
        },
      },
      {
        tag: 'img',
        getAttrs: (element) => {
          const image = element as HTMLElement
          const width = image.getAttribute('width')
          const parsedWidth = width ? Number(width) : NaN
          return {
            src: image.getAttribute('src') ?? null,
            alt: image.getAttribute('alt') ?? '',
            width: Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : null,
            align: 'center',
            caption: '',
            href: null,
          }
        },
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { align, width, caption, href } = node.attrs
    const image = [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: node.attrs.src,
        alt: node.attrs.alt ?? '',
        ...(width ? { width: String(width) } : {}),
        loading: 'lazy',
      }),
    ]
    const figureChildren: unknown[] = []
    if (href) {
      figureChildren.push(['a', { href, target: '_blank', rel: 'noopener noreferrer' }, image])
    } else {
      figureChildren.push(image)
    }
    if (caption) {
      figureChildren.push(['figcaption', {}, caption])
    }
    return [
      'figure',
      {
        'data-align': align ?? 'center',
        ...(width ? { 'data-width': String(width) } : {}),
      },
      ...figureChildren,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProductImageNodeView)
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ tr, dispatch }) => {
          const { selection } = tr
          const node = this.type.create(options)
          if (selection.empty) {
            tr.insert(selection.$from.pos, node)
          } else {
            tr.replaceSelectionWith(node)
          }
          dispatch?.(tr)
          return true
        },
      moveImageUp: () => (props) => moveImageBlock(props, -1),
      moveImageDown: () => (props) => moveImageBlock(props, 1),
    }
  },
})