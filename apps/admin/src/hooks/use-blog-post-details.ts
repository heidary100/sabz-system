import { useEffect, useMemo, useState } from 'react'
import type { BlogPostDetailDto } from '@sabz/types'
import { merchandisingErrorMessage } from '../lib/merchandising-errors'
import { getAdminPost } from '../services/blog'

const detailCache = new Map<string, BlogPostDetailDto>()
const inFlight = new Map<string, Promise<BlogPostDetailDto>>()

export function clearBlogPostDetailCache(): void {
  detailCache.clear()
  inFlight.clear()
}

/** Bounded/de-duplicated card-safe blog details for manual feature selection. */
export function useBlogPostDetails(ids: string[]) {
  const idKey = useMemo(() => [...new Set(ids)].sort().join('|'), [ids])
  const [details, setDetails] = useState<Record<string, BlogPostDetailDto>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const unique = idKey ? idKey.split('|') : []
    let cancelled = false
    const cached: Record<string, BlogPostDetailDto> = {}
    const nextLoading: Record<string, boolean> = {}
    for (const id of unique) {
      const item = detailCache.get(id)
      if (item) {
        cached[id] = item
      } else {
        nextLoading[id] = true
      }
    }
    setDetails(cached)
    setLoading(nextLoading)
    setErrors({})

    for (const id of unique) {
      if (detailCache.has(id)) {
        continue
      }
      let promise = inFlight.get(id)
      if (!promise) {
        promise = getAdminPost(id)
          .then((post) => {
            detailCache.set(id, post)
            return post
          })
          .finally(() => inFlight.delete(id))
        inFlight.set(id, promise)
      }
      promise
        .then((post) => {
          if (!cancelled) {
            setDetails((prev) => ({ ...prev, [id]: post }))
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setErrors((prev) => ({
              ...prev,
              [id]: merchandisingErrorMessage(error),
            }))
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading((prev) => ({ ...prev, [id]: false }))
          }
        })
    }
    return () => {
      cancelled = true
    }
  }, [idKey])

  return { details, loading, errors }
}
