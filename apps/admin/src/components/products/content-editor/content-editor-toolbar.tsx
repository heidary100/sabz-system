import type { Editor } from '@tiptap/react'
import clsx from 'clsx'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Maximize2,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
  accent,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  accent?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-strong hover:text-foreground',
        active && 'bg-primary-subtle text-primary',
        accent && !active && 'text-secondary hover:text-secondary',
        disabled && 'opacity-40',
      )}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
}

/**
 * Grouped, horizontally scrollable toolbar for the product content editor.
 * RTL-first; on small screens the row scrolls instead of wrapping the full
 * desktop toolbar onto multiple lines.
 */
export function ContentEditorToolbar({
  editor,
  disabled,
  fullscreen,
  preview,
  onInsertImage,
  onToggleFullscreen,
  onTogglePreview,
}: {
  editor: Editor
  disabled: boolean
  fullscreen: boolean
  preview: boolean
  onInsertImage: () => void
  onToggleFullscreen: () => void
  onTogglePreview: () => void
}) {
  const tableActive = editor.isActive('table')
  const rowActive = tableActive && ['tableRow', 'tableCell', 'tableHeader'].some((n) => editor.isActive(n))

  return (
    <div
      className="flex items-center gap-0.5 overflow-x-auto px-2 py-1.5"
      dir="rtl"
      role="toolbar"
      aria-label="نوار ابزار ویرایشگر"
    >
      <ToolbarButton
        title="پاراگراف"
        active={editor.isActive('paragraph')}
        disabled={disabled}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        <Pilcrow className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="عنوان ۱"
        active={editor.isActive('heading', { level: 1 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="عنوان ۲"
        active={editor.isActive('heading', { level: 2 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="عنوان ۳"
        active={editor.isActive('heading', { level: 3 })}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="بولد"
        active={editor.isActive('bold')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="ایتالیک"
        active={editor.isActive('italic')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="زیرخط"
        active={editor.isActive('underline')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="خطخورده"
        active={editor.isActive('strike')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="لیست نامرتب"
        active={editor.isActive('bulletList')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="لیست مرتب"
        active={editor.isActive('orderedList')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="نقلقول"
        active={editor.isActive('blockquote')}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="خط جداکننده"
        disabled={disabled}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="تراز راست"
        active={editor.isActive({ textAlign: 'right' })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <AlignRight className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="تراز وسط"
        active={editor.isActive({ textAlign: 'center' })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <AlignCenter className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="تراز چپ"
        active={editor.isActive({ textAlign: 'left' })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <AlignLeft className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="تراز کامل"
        active={editor.isActive({ textAlign: 'justify' })}
        disabled={disabled}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        <AlignJustify className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="افزودن لینک"
        active={editor.isActive('link')}
        disabled={disabled}
        onClick={() => {
          const previous = (editor.getAttributes('link').href as string) ?? ''
          const url = window.prompt('آدرس لینک (https://…)', previous)
          if (url === null) return
          if (url.trim() === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run()
            return
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
        }}
      >
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="حذف لینک"
        disabled={disabled || !editor.isActive('link')}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      >
        <Link2Off className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="درج جدول"
        disabled={disabled}
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        <Table2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="افزودن ردیف"
        active={rowActive}
        disabled={disabled || !tableActive}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        <Rows3 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="افزودن ستون"
        active={rowActive}
        disabled={disabled || !tableActive}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        <Columns3 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="حذف ردیف"
        disabled={disabled || !rowActive}
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        <Rows3 className="size-4 text-danger" />
      </ToolbarButton>
      <ToolbarButton
        title="حذف ستون"
        disabled={disabled || !rowActive}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        <Columns3 className="size-4 text-danger" />
      </ToolbarButton>
      <ToolbarButton
        title="حذف جدول"
        disabled={disabled || !tableActive}
        onClick={() => editor.chain().focus().deleteTable().run()}
      >
        <Trash2 className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="افزودن تصویر"
        disabled={disabled}
        onClick={onInsertImage}
        accent
      >
        <ImageIcon className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title="واگرد"
        disabled={disabled || !editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="ازنو"
        disabled={disabled || !editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="پاکسازی قالب"
        disabled={disabled}
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <RemoveFormatting className="size-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        title={preview ? 'خروج از پیشنمایش' : 'پیشنمایش'}
        active={preview}
        disabled={disabled}
        onClick={onTogglePreview}
        accent
      >
        <Eye className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title={fullscreen ? 'خروج از تمامصفحه' : 'تمامصفحه'}
        active={fullscreen}
        disabled={disabled}
        onClick={onToggleFullscreen}
        accent
      >
        <Maximize2 className="size-4" />
      </ToolbarButton>
    </div>
  )
}