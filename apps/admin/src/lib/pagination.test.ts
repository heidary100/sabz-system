import { describe, expect, it } from 'vitest'
import { pageNumbers } from './pagination'

describe('pageNumbers', () => {
  it('lists every page when there are seven or fewer', () => {
    expect(pageNumbers(1, 1)).toEqual([1])
    expect(pageNumbers(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(pageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('returns nothing for an empty result set', () => {
    expect(pageNumbers(1, 0)).toEqual([])
  })

  it('omits the leading gap near the start', () => {
    expect(pageNumbers(1, 10)).toEqual([1, 2, 'gap', 10])
    expect(pageNumbers(2, 10)).toEqual([1, 2, 3, 'gap', 10])
  })

  it('keeps first + last with gaps around a middle page', () => {
    expect(pageNumbers(4, 10)).toEqual([1, 'gap', 3, 4, 5, 'gap', 10])
    expect(pageNumbers(5, 12)).toEqual([1, 'gap', 4, 5, 6, 'gap', 12])
    expect(pageNumbers(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
  })

  it('omits the trailing gap near the end', () => {
    expect(pageNumbers(9, 10)).toEqual([1, 'gap', 8, 9, 10])
    expect(pageNumbers(10, 10)).toEqual([1, 'gap', 9, 10])
  })
})
