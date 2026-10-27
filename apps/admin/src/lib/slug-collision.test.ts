import { describe, expect, it } from 'vitest'
import { findSlugCollision } from './slug-collision'

const rows = [
  { id: 'a', slug: 'kalay-dyjytal' },
  { id: 'b', slug: 'lptap' },
  { id: 'c', slug: 'hard-akstrnal-ay-dyta-mdl-hd710-pro' },
]

describe('findSlugCollision', () => {
  it('finds an exact match', () => {
    expect(findSlugCollision(rows, 'lptap')?.id).toBe('b')
  })

  it('is exact — no case folding, no normalization, no substring', () => {
    expect(findSlugCollision(rows, 'LPTAP')).toBeNull()
    expect(findSlugCollision(rows, 'lptap-2')).toBeNull()
    expect(findSlugCollision(rows, 'lpta')).toBeNull()
  })

  it('excludes the current record in edit mode', () => {
    expect(findSlugCollision(rows, 'lptap', 'b')).toBeNull()
    expect(findSlugCollision(rows, 'lptap', 'a')?.id).toBe('b')
  })

  it('never warns on an empty or whitespace-only proposal', () => {
    expect(findSlugCollision(rows, '')).toBeNull()
    expect(findSlugCollision(rows, '   ')).toBeNull()
  })

  it('returns null when the dataset lacks the slug (no false warning)', () => {
    expect(findSlugCollision(rows, 'missing-slug')).toBeNull()
  })
})
