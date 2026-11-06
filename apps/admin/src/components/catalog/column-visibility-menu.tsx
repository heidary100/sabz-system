import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Columns3 } from 'lucide-react'
import type { GridColumnKey } from '../../lib/grid-columns'
import {
  GRID_COLUMN_LABELS,
  GRID_FIXED_COLUMNS,
  GRID_HIDEABLE_COLUMNS,
} from '../../lib/grid-columns'

/**
 * Column visibility control (SS-257): a checkbox list. The operational core
 * columns are fixed and listed (disabled, always checked) so the operator
 * sees what is always present; only the informational columns toggle.
 * Selection is persisted by the caller.
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
      <MenuItems anchor="bottom start" className="z-50 min-w-56">
        {GRID_HIDEABLE_COLUMNS.map((key) => (
          <MenuItem key={key}>
            <label className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm data-focus:bg-zinc-100">
              <input
                type="checkbox"
                checked={visible.includes(key)}
                onChange={() => onToggle(key)}
                className="accent-primary"
              />
              <span>{GRID_COLUMN_LABELS[key]}</span>
            </label>
          </MenuItem>
        ))}
        <li className="mt-1 border-t border-border pt-1">
          {GRID_FIXED_COLUMNS.map((key) => (
            <div
              key={key}
              className="flex items-center gap-2 px-3 py-2 text-sm text-muted"
              aria-disabled="true"
            >
              <input type="checkbox" checked disabled readOnly tabIndex={-1} />
              <span>{GRID_COLUMN_LABELS[key]}</span>
              <span className="ms-auto text-xs">همیشه نمایان</span>
            </div>
          ))}
        </li>
      </MenuItems>
    </Menu>
  )
}
