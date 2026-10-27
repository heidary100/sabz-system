import { useEffect, useState } from 'react'
import type { ProductSummary } from '@sabz/types'
import { listProducts } from '../services/products'
import { findSlugCollision } from '../lib/slug-collision'

/**
 * SS-254 product-slug collision hint.
 *
 * Products have no complete client-side dataset (server-paginated catalog),
 * so the hint probes the EXISTING `GET /admin/products?search=<slug>` endpoint
 * (its search already matches name OR slug, case-insensitive contains) and
 * filters the results to exact slug matches client-side. Debounced 300 ms
 * with a request-sequence guard against out-of-order responses.
 *
 * Honesty: this is a search SUBSET — an absent match never proves
 * availability, so the UI only ever warns on a found collision; the server
 * 409 stays authoritative. Returns null while no probe has settled yet.
 */
const DEBOUNCE_MS = 300
const PROBE_LIMIT = 100

export function useProductSlugCollision(
  slug: string,
  excludeId?: string,
): boolean | null {
  const [collision, setCollision] = useState<boolean | null>(null)

  useEffect(() => {
    const candidate = slug.trim()
    if (candidate === '') {
      setCollision(null)
      return
    }
    let active = true
    const timer = setTimeout(() => {
      listProducts({ page: 1, limit: PROBE_LIMIT, search: candidate })
        .then((page) => {
          if (!active) return
          setCollision(
            findSlugCollision(
              page.items as ProductSummary[],
              candidate,
              excludeId,
            ) !== null,
          )
        })
        .catch(() => {
          if (active) setCollision(null)
        })
    }, DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [slug, excludeId])

  return collision
}
