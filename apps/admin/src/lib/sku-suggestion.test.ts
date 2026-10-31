import { describe, expect, it } from 'vitest'
import { suggestSku, type SkuRandomSource } from './sku-suggestion'

const SKU_PATTERN = /^SBZ-[ABCDEFGHJKMNPQRSTVWXYZ23456789]{8}$/

/** One byte per call, drawn from `values` in order (0 past the end). */
function sequenceSource(values: number[]): SkuRandomSource {
  let cursor = 0
  return () => {
    const value = values[cursor]
    cursor += 1
    return Uint8Array.from([value ?? 0])
  }
}

describe('SKU suggestion generator (SS-256)', () => {
  it('matches the documented format across many default draws', () => {
    for (let i = 0; i < 200; i += 1) {
      const sku = suggestSku()
      expect(sku).toMatch(SKU_PATTERN)
      expect(sku.length).toBeLessThanOrEqual(64)
    }
  })

  it('is deterministic for a fixed random source', () => {
    // Alphabet indices: 0-7 = A B C D E F G H; 22-29 = 2 3 4 5 6 7 8 9.
    expect(suggestSku(sequenceSource([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('SBZ-ABCDEFGH')
    expect(suggestSku(sequenceSource([29, 28, 27, 26, 25, 24, 23, 22]))).toBe('SBZ-98765432')
  })

  it('rejects bytes at/above the uniform ceiling and keeps drawing', () => {
    // Every odd draw is rejected (240-255); every even draw maps to the
    // alphabet — the rejection loop must consume exactly this sequence.
    expect(
      suggestSku(sequenceSource([240, 0, 255, 1, 240, 2, 241, 3, 250, 4, 5, 6, 7, 8])),
    ).toBe('SBZ-ABCDEFGH')
  })

  it('throws when the random source never yields an acceptable byte (no infinite loop)', () => {
    expect(() => suggestSku(() => Uint8Array.from([255]))).toThrow(/draw budget/)
  })

  it('throws when the random source returns no bytes', () => {
    expect(() => suggestSku(() => new Uint8Array(0))).toThrow(/no bytes/)
  })

  it('does not repeat suggestions across a large draw (collision space check)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i += 1) {
      seen.add(suggestSku())
    }
    expect(seen.size).toBe(1000)
  })
})
