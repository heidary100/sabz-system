import { useState } from 'react'
import { Button } from '../catalyst/button'
import { Field, Label } from '../catalyst/fieldset'
import { Input } from '../catalyst/input'
import { Text } from '../catalyst/text'
import { slugify } from '../../lib/slug'

/**
 * Shared slug field with live suggestions (SS-254) — used by the product,
 * brand and category forms.
 *
 * State model (two modes only):
 * - `auto`: the field displays `slugify(name)` (derived, never stored — the
 *   form receives it through `onChange` whenever the name changes); the
 *   first manual keystroke switches to `manual`.
 * - `manual`: the value is frozen; name changes never overwrite it. The
 *   «ساخت مجدد از روی نام» button regenerates from the CURRENT name and
 *   returns to `auto`. A persisted slug (edit mode) is initialized as
 *   `manual`, so opening the form or rerendering can never rewrite it.
 *
 * The parent owns `{slug, mode}` state so submission keeps the existing
 * payload contract (slug sent only when non-empty — server fallback and
 * persisted-slug preservation unchanged). `collisionHint` renders only when
 * the parent found an exact match; absence never claims availability.
 */
export type SlugMode = 'auto' | 'manual'

export function useSlugSuggestion(initial: { slug: string; mode: SlugMode }) {
  const [slug, setSlug] = useState(initial.slug)
  const [mode, setMode] = useState<SlugMode>(initial.mode)

  return {
    slug,
    mode,
    /** Input on the slug field: apply the keystroke and lock to manual. */
    handleSlugInput: (value: string): void => {
      setSlug(value)
      setMode('manual')
    },
    /** Explicit regenerate: suggestion for the CURRENT name, back to auto. */
    regenerate: (): void => {
      setMode('auto')
    },
    setSlug,
    setMode,
  }
}

export function SlugField({
  name,
  slug,
  mode,
  onInput,
  onRegenerate,
  collisionHint,
  conflictMessage,
  disabled,
}: {
  /** Current entity name — drives the auto suggestion. */
  name: string
  slug: string
  mode: SlugMode
  /** Manual keystroke: applies the value and locks the field. */
  onInput: (value: string) => void
  /** Regenerate button: resume suggestions from the current name. */
  onRegenerate: () => void
  /** Exact-match warning from the parent's dataset (or null). */
  collisionHint?: string | null
  /** Field-level server-409 message (input and mode survive). */
  conflictMessage?: string | null
  disabled?: boolean
}) {
  const suggestion = slugify(name)
  const effective = mode === 'auto' ? suggestion : slug
  const helper =
    mode === 'auto'
      ? suggestion === ''
        ? 'با وارد شدن نام، نشانی ساخته می‌شود.'
        : 'این نشانی بر اساس نام ساخته می‌شود.'
      : 'نشانی به‌صورت دستی ویرایش شده و با تغییر نام بازنویسی نمی‌شود.'

  return (
    <Field>
      <Label>نشانی (Slug)</Label>
      <div className="flex items-center gap-2">
        <Input
          name="slug"
          dir="ltr"
          maxLength={255}
          value={effective}
          placeholder="در صورت خالی بودن، از نام ساخته میشود"
          onChange={(event) => onInput(event.target.value)}
          disabled={disabled}
        />
        {mode === 'manual' && (
          <Button
            type="button"
            outline
            onClick={onRegenerate}
            disabled={disabled}
            className="shrink-0"
          >
            ساخت مجدد از روی نام
          </Button>
        )}
      </div>
      <Text className="text-xs text-muted">{helper}</Text>
      <Text className="text-xs text-muted">فقط حروف انگلیسی کوچک، اعداد و خط تیره.</Text>
      {collisionHint && (
        <Text className="text-xs font-medium text-amber-600">
          ⚠ {collisionHint}
        </Text>
      )}
      {conflictMessage && (
        <Text className="text-xs font-medium text-red-600">{conflictMessage}</Text>
      )}
    </Field>
  )
}
