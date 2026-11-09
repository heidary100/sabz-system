import { useEffect, useMemo, useState } from 'react'
import type { MerchCampaignDto } from '@sabz/types'
import { merchandisingErrorMessage } from '../lib/merchandising-errors'
import { getMerchCampaign } from '../services/merchandising'

const detailCache = new Map<string, MerchCampaignDto>()
const inFlight = new Map<string, Promise<MerchCampaignDto>>()

/** Test/helper escape hatch; normal UI keeps bounded detail caching for the session. */
export function clearMerchCampaignDetailCache(): void {
  detailCache.clear()
  inFlight.clear()
}

/**
 * Bounded, de-duplicated campaign detail loader for homepage section forms.
 *
 * Campaign list rows intentionally omit category/media evidence. The section
 * forms fetch details only for the campaigns they actually reference and share
 * in-flight/cached results across form switches, avoiding repeated N+1 calls.
 */
export function useMerchCampaignDetails(ids: string[]) {
  const idKey = useMemo(
    () => [...new Set(ids)].sort().join('|'),
    [ids],
  )
  const [details, setDetails] = useState<Record<string, MerchCampaignDto>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const unique = idKey ? idKey.split('|') : []
    let cancelled = false

    const cached: Record<string, MerchCampaignDto> = {}
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
        promise = getMerchCampaign(id)
          .then((campaign) => {
            detailCache.set(id, campaign)
            return campaign
          })
          .finally(() => {
            inFlight.delete(id)
          })
        inFlight.set(id, promise)
      }
      promise
        .then((campaign) => {
          if (!cancelled) {
            setDetails((prev) => ({ ...prev, [id]: campaign }))
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
