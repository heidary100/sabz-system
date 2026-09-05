import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  ArrowDown,
  ArrowUp,
  Crop,
  ImagePlus,
  Link2Off,
  Trash2,
} from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Text } from '../../catalyst/text'
import { IMAGE_MIN_WIDTH, IMAGE_MAX_WIDTH } from './content-editor-image-utils'

type PanelAttrs = {
  src: string
  alt: string
  width: number | null
  align: 'left' | 'center' | 'right'
  caption: string
  href: string | null
}

function AlignOption({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-md px-2 py-1 text-sm transition-colors ${
        active
          ? 'bg-primary-subtle font-medium text-primary'
          : 'text-muted hover:bg-surface-strong hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}

/**
 * Floating image properties panel shown while an image node is selected.
 * Every control drives the node attributes directly (width, alignment,
 * caption, alt text, link), so the panel, the resize handle and the stored
 * serialization always stay synchronized.
 */
export function ImagePropertiesPanel({
  editor,
  attrs,
  disabled,
  onOpenCrop,
  onReplaceFile,
}: {
  editor: Editor
  attrs: PanelAttrs
  disabled: boolean
  onOpenCrop: (src: string) => void
  onReplaceFile: (file: File) => void
}) {
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const [widthText, setWidthText] = useState(attrs.width ? String(attrs.width) : '')

  useEffect(() => {
    setWidthText(attrs.width ? String(attrs.width) : '')
  }, [attrs.width])

  const update = (partial: Partial<PanelAttrs>): void => {
    editor.chain().focus().updateAttributes('image', partial).run()
  }

  const applyWidth = (): void => {
    const parsed = Number(widthText)
    if (Number.isFinite(parsed) && parsed > 0) {
      update({ width: Math.min(IMAGE_MAX_WIDTH, Math.max(IMAGE_MIN_WIDTH, Math.round(parsed))) })
    } else if (widthText.trim() === '') {
      update({ width: null })
    }
  }

  const handleReplaceChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      onReplaceFile(file)
    }
  }

  return (
    <div className="glass w-full rounded-xl border border-glass-border p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">تصویر</p>
        <div className="flex items-center gap-1">
          <Button
            outline
            disabled={disabled}
            onClick={() => editor.commands.moveImageUp()}
            title="انتقال به بالا"
            aria-label="انتقال به بالا"
            className="!px-2"
          >
            <ArrowUp data-slot="icon" className="size-4" />
          </Button>
          <Button
            outline
            disabled={disabled}
            onClick={() => editor.commands.moveImageDown()}
            title="انتقال به پایین"
            aria-label="انتقال به پایین"
            className="!px-2"
          >
            <ArrowDown data-slot="icon" className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field>
          <Label>عرض (پیکسل)</Label>
          <div className="flex items-center gap-2">
            <Input
              dir="ltr"
              inputMode="numeric"
              value={widthText}
              placeholder="خودکار"
              onChange={(event) => setWidthText(event.target.value)}
              onBlur={applyWidth}
              disabled={disabled}
            />
          </div>
          <Text className="text-xs text-muted">
            نسبت ابعاد بهصورت خودکار حفظ میشود؛ حداقل {IMAGE_MIN_WIDTH} و حداکثر {IMAGE_MAX_WIDTH} پیکسل.
          </Text>
        </Field>

        <Field>
          <Label>تراز</Label>
          <div className="flex overflow-hidden rounded-lg border border-border" dir="rtl">
            <AlignOption label="راست" active={attrs.align === 'right'} onClick={() => update({ align: 'right' })} />
            <AlignOption label="وسط" active={attrs.align === 'center'} onClick={() => update({ align: 'center' })} />
            <AlignOption label="چپ" active={attrs.align === 'left'} onClick={() => update({ align: 'left' })} />
          </div>
        </Field>

        <Field>
          <Label>متن جایگزین (alt)</Label>
          <Input
            value={attrs.alt}
            placeholder="توضیح کوتاه برای دسترسپذیری"
            onChange={(event) => update({ alt: event.target.value })}
            disabled={disabled}
          />
          <Text className="text-xs text-muted">
            متن جایگزین به دسترسپذیری تصویر کمک میکند و هنگام بارگذاری نشدن تصویر نمایش داده میشود.
          </Text>
        </Field>

        <Field>
          <Label>زیرنویس (اختیاری)</Label>
          <Input
            value={attrs.caption}
            placeholder="مثلاً: لپتاپ گیمینگ — نمای جلو"
            onChange={(event) => update({ caption: event.target.value })}
            disabled={disabled}
          />
        </Field>

        <Field>
          <Label>پیوند تصویر (اختیاری)</Label>
          <div className="flex items-center gap-2">
            <Input
              dir="ltr"
              value={attrs.href ?? ''}
              placeholder="https://example.com/product"
              onChange={(event) => update({ href: event.target.value.trim() || null })}
              disabled={disabled}
            />
            {attrs.href && (
              <Button
                outline
                onClick={() => update({ href: null })}
                title="حذف پیوند"
                aria-label="حذف پیوند"
                className="!px-2"
              >
                <Link2Off data-slot="icon" className="size-4" />
              </Button>
            )}
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            outline
            disabled={disabled}
            onClick={() => onOpenCrop(attrs.src)}
          >
            <Crop data-slot="icon" />
            برش
          </Button>
          <Button
            outline
            disabled={disabled}
            onClick={() => replaceInputRef.current?.click()}
          >
            <ImagePlus data-slot="icon" />
            جایگزینی
          </Button>
          <Button
            outline
            className="text-danger"
            disabled={disabled}
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            <Trash2 data-slot="icon" />
            حذف
          </Button>
        </div>
      </div>

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleReplaceChange}
        disabled={disabled}
      />
    </div>
  )
}