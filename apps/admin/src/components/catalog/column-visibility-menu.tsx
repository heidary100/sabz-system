import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Columns3, Check } from 'lucide-react'
import type { GridColumnKey } from '../../lib/grid-columns'
import {
  GRID_COLUMN_LABELS,
  GRID_FIXED_COLUMNS,
  GRID_HIDEABLE_COLUMNS,
} from '../../lib/grid-columns'

/**
 * Column visibility control (SS-257). The operational core columns are fixed
 * and listed (disabled) so the operator sees what is always present; only
 * the informational columns toggle. Selection is persisted by the caller.
 */
export interface ColumnVisibilityMenuProps {
  visible: GridColumnKey[]
  onToggle: (key: GridColumnKey) => void
}

export function ColumnVisibilityMenu({ visible, onToggle }: ColumnVisibilityMenuProps) {
  return (
    <Menu>
      <MenuButton
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-950/10 bg-white px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-primary"
      >
        <Columns3 className="size-4" aria-hidden />
        ستون‌ها
      </MenuButton>
      <MenuItems anchor="bottom start" className="z-50 min-w-44">
        {GRID_HIDEABLE_COLUMNS.map((key) => (
          <MenuItem key={key}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm data-focus:bg-zinc-100"
              onClick={() => onToggle(key)}
            >
              <span>{GRID_COLUMN_LABELS[key]}</span>
              {visible.includes(key) ? <Check className="size-4" aria-hidden /> : null}
            </button>
          </MenuItem>
        ))}
        <li className="mt-1 border-t border-border pt-1">
          {GRID_FIXED_COLUMNS.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-muted"
              aria-disabled="true"
            >
              <span>{GRID_COLUMN_LABELS[key]}</span>
              <span className="text-xs">همیشه نمایان</span>
            </div>
          ))}
        </li>
      </MenuItems>
    </Menu>
  )
}
