import { describe, expect, it } from 'vitest'
import {
  clampImageWidth,
  IMAGE_MAX_WIDTH,
  IMAGE_MIN_WIDTH,
  suggestedImageWidth,
} from './content-editor-image-utils'

describe('content-editor-image-utils', () => {
  describe('clampImageWidth', () => {
    it('clamps below the minimum', () => {
      expect(clampImageWidth(10)).toBe(IMAGE_MIN_WIDTH)
      expect(clampImageWidth(0)).toBe(IMAGE_MIN_WIDTH)
      expect(clampImageWidth(-5)).toBe(IMAGE_MIN_WIDTH)
    })

    it('clamps above the maximum', () => {
      expect(clampImageWidth(99999)).toBe(IMAGE_MAX_WIDTH)
    })

    it('rounds fractional widths', () => {
      expect(clampImageWidth(640.6)).toBe(641)
    })

    it('respects a custom maximum', () => {
      expect(clampImageWidth(1200, 800)).toBe(800)
    })

    it('handles non-finite input', () => {
      expect(clampImageWidth(Number.NaN)).toBe(IMAGE_MIN_WIDTH)
      expect(clampImageWidth(Number.POSITIVE_INFINITY)).toBe(IMAGE_MIN_WIDTH)
    })
  })

  describe('suggestedImageWidth', () => {
    it('returns the natural width when within bounds', () => {
      expect(suggestedImageWidth(640)).toBe(640)
    })

    it('clamps huge natural widths', () => {
      expect(suggestedImageWidth(5000)).toBe(IMAGE_MAX_WIDTH)
    })

    it('falls back for unknown natural widths', () => {
      expect(suggestedImageWidth(undefined)).toBe(720)
    })
  })
})