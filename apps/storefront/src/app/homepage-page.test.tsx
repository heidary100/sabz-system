// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publishedHomepageFixture } from '@/lib/__fixtures__/published-homepage'

const homepage = vi.hoisted(() => ({ fetch: vi.fn() }))

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/homepage', () => ({
  fetchPublishedHomepage: homepage.fetch,
}))
vi.mock('@/components/ecommerce/home/published-homepage', () => ({
  PublishedHomepage: ({ homepage: value }: { homepage: { version: number } }) => (
    <div data-testid="published">نسخه {value.version}</div>
  ),
}))
vi.mock('@/components/ecommerce/home/homepage-state', () => ({
  HomepageState: ({ kind }: { kind: string }) => (
    <div data-testid="state" data-kind={kind} />
  ),
}))

import HomePage from './page'

afterEach(() => {
  cleanup()
  homepage.fetch.mockReset()
})

describe('HomePage', () => {
  it('renders the published composition', async () => {
    homepage.fetch.mockResolvedValue({
      status: 'published',
      homepage: publishedHomepageFixture(),
    })

    render(await HomePage())

    expect(screen.getByTestId('published').textContent).toContain('7')
    expect(screen.queryByTestId('state')).toBeNull()
  })

  it('renders the neutral empty state when no publication exists', async () => {
    homepage.fetch.mockResolvedValue({ status: 'empty' })

    render(await HomePage())

    expect(screen.getByTestId('state').dataset.kind).toBe('empty')
    expect(screen.queryByTestId('published')).toBeNull()
  })

  it('renders an intentionally empty published homepage without a fallback', async () => {
    homepage.fetch.mockResolvedValue({
      status: 'published',
      homepage: publishedHomepageFixture({ sections: [] }),
    })

    render(await HomePage())

    expect(screen.getByTestId('state').dataset.kind).toBe('published-empty')
    expect(screen.queryByTestId('published')).toBeNull()
  })

  it('renders the unavailable state when the API fails', async () => {
    homepage.fetch.mockResolvedValue({
      status: 'unavailable',
      reason: 'network',
    })

    render(await HomePage())

    expect(screen.getByTestId('state').dataset.kind).toBe('unavailable')
    expect(screen.queryByTestId('published')).toBeNull()
  })

  it('makes exactly one homepage content request per render', async () => {
    homepage.fetch.mockResolvedValue({ status: 'empty' })

    render(await HomePage())

    expect(homepage.fetch).toHaveBeenCalledTimes(1)
  })
})
