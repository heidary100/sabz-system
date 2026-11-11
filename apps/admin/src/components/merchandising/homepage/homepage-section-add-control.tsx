import { useId, useState } from 'react'
import type { HomepageSectionType } from '@sabz/types'
import { Plus } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Field, Label } from '../../catalyst/fieldset'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { InlineError } from '../../ui/inline-error'
import {
  HOMEPAGE_SECTION_REGISTRY,
  HOMEPAGE_SECTION_TYPE_ORDER,
} from '../../../lib/merchandising-homepage'

/**
 * Shared add-section control used by the desktop outline and the tablet/mobile
 * accordion so both surfaces select from the same supported registry.
 */
export function HomepageSectionAddControl({
  sectionCount,
  maxSections,
  disabled = false,
  onAdd,
}: {
  sectionCount: number
  maxSections: number
  disabled?: boolean
  onAdd: (type: HomepageSectionType) => string | null
}) {
  const uid = useId()
  const selectId = `homepage-add-section-type-${uid}`
  const [addType, setAddType] = useState<HomepageSectionType>('TRUST_STRIP')
  const [addError, setAddError] = useState<string | null>(null)
  const selection = HOMEPAGE_SECTION_REGISTRY[addType]
  const maxReached = sectionCount >= maxSections

  const handleAdd = (): void => {
    setAddError(null)
    const error = onAdd(addType)
    if (error) {
      setAddError(error)
    }
  }

  return (
    <div className="space-y-2">
      <Field>
        <Label htmlFor={selectId}>افزودن بخش</Label>
        <Select
          id={selectId}
          value={addType}
          disabled={disabled || maxReached}
          onChange={(event) =>
            setAddType(event.target.value as HomepageSectionType)
          }
        >
          {HOMEPAGE_SECTION_TYPE_ORDER.map((type) => {
            const definition = HOMEPAGE_SECTION_REGISTRY[type]
            return (
              <option key={type} value={type}>
                {definition.label}
                {!definition.canAdd ? ' — ایجاد در گام بعدی' : ''}
              </option>
            )
          })}
        </Select>
      </Field>
      <Text className="text-xs text-muted">{selection.description}</Text>
      {!selection.canAdd && selection.unavailableReason && (
        <Text className="text-xs text-warning">
          {selection.unavailableReason}
        </Text>
      )}
      {addError && <InlineError message={addError} />}
      <Button
        outline
        data-homepage-add
        disabled={disabled || maxReached || !selection.canAdd}
        onClick={handleAdd}
      >
        <Plus data-slot="icon" />
        افزودن بخش
      </Button>
      {maxReached && (
        <Text className="text-xs text-muted">
          حداکثر تعداد بخش‌ها تکمیل شده است.
        </Text>
      )}
    </div>
  )
}
