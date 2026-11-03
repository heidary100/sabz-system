// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  GRID_ALL_COLUMNS,
  GRID_COLUMN_STORAGE_KEY,
  GRID_FIXED_COLUMNS,
  readVisibleColumns,
  writeVisibleColumns,
} from './grid-columns'

afterEach(() => {
  localStorage.removeItem(GRID_COLUMN_STORAGE_KEY)
})

describe('catalog grid column visibility persistence (SS-257)', () => {
  it('defaults to every column when nothing is stored', () => {
    expect(readVisibleColumns()).toEqual([...GRID_ALL_COLUMNS])
  })

  it('round-trips a stored selection', () => {
    writeVisibleColumns(['name', 'sku', 'stock', 'regularPrice', 'salePrice', 'priceStatus'])
    expect(readVisibleColumns()).not.toContain('thumbnail')
    expect(readVisibleColumns()).not.toContain('brand')
  })

  it('always restores the fixed operational columns, even if persisted without them', () => {
    localStorage.setItem(GRID_COLUMN_STORAGE_KEY, JSON.stringify(['thumbnail', 'brand']))
    const visible = readVisibleColumns()
    for (const key of GRID_FIXED_COLUMNS) {
      expect(visible).toContain(key)
    }
    // Stored hideable columns survive the restore.
    expect(visible).toContain('thumbnail')
    expect(visible).toContain('brand')
  })

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem(GRID_COLUMN_STORAGE_KEY, 'not-json{')
    expect(readVisibleColumns()).toEqual([...GRID_ALL_COLUMNS])
  })
})
