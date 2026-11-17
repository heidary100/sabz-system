import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HomepageDraftDto,
  HomepageDraftValidationResult,
  HomepagePublicationListResponse,
  HomepagePublicationSummaryDto,
  MerchCampaignListResponse,
  MerchMediaListResponse,
} from '@sabz/types'
import {
  getHomepageDraft,
  listHomepagePublications,
  listMerchCampaigns,
  listMerchMedia,
  validateHomepageDraft,
} from '../services/merchandising'

export interface MerchOverviewSection<T> {
  data: T | null
  loading: boolean
  error: unknown | null
  reload: () => void
}

function section<T>(
  data: T | null,
  loading: boolean,
  error: unknown | null,
  reload: () => void,
): MerchOverviewSection<T> {
  return { data, loading, error, reload }
}

/**
 * Bounded merchandising overview read model (SS-282).
 *
 * Each card owns its request sequence so a failure or retry in one section
 * cannot blank or stale-overwrite another. Draft validation is started only
 * after a successful draft read; it never persists draft content.
 */
export function useMerchandisingOverview() {
  const [currentPublication, setCurrentPublication] =
    useState<HomepagePublicationSummaryDto | null>(null)
  const [currentLoading, setCurrentLoading] = useState(true)
  const [currentError, setCurrentError] = useState<unknown | null>(null)

  const [scheduled, setScheduled] =
    useState<HomepagePublicationListResponse | null>(null)
  const [scheduledLoading, setScheduledLoading] = useState(true)
  const [scheduledError, setScheduledError] = useState<unknown | null>(null)

  const [draft, setDraft] = useState<HomepageDraftDto | null>(null)
  const [draftLoading, setDraftLoading] = useState(true)
  const [draftError, setDraftError] = useState<unknown | null>(null)

  const [draftValidation, setDraftValidation] =
    useState<HomepageDraftValidationResult | null>(null)
  const [validationLoading, setValidationLoading] = useState(false)
  const [validationError, setValidationError] = useState<unknown | null>(null)

  const [campaigns, setCampaigns] = useState<MerchCampaignListResponse | null>(
    null,
  )
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState<unknown | null>(null)

  const [media, setMedia] = useState<MerchMediaListResponse | null>(null)
  const [mediaLoading, setMediaLoading] = useState(true)
  const [mediaError, setMediaError] = useState<unknown | null>(null)

  const currentSeq = useRef(0)
  const scheduledSeq = useRef(0)
  const draftSeq = useRef(0)
  const validationSeq = useRef(0)
  const campaignsSeq = useRef(0)
  const mediaSeq = useRef(0)
  const initializedRef = useRef(false)
  const mountedRef = useRef(true)

  const isActive = (seq: number, ref: { current: number }): boolean =>
    mountedRef.current && seq === ref.current

  const loadCurrent = useCallback(async (): Promise<void> => {
    const seq = ++currentSeq.current
    setCurrentLoading(true)
    setCurrentError(null)
    try {
      const response = await listHomepagePublications({
        status: 'PUBLISHED',
        page: 1,
        limit: 1,
      })
      if (isActive(seq, currentSeq)) {
        setCurrentPublication(response.items[0] ?? null)
      }
    } catch (error) {
      if (isActive(seq, currentSeq)) {
        setCurrentError(error)
      }
    } finally {
      if (isActive(seq, currentSeq)) {
        setCurrentLoading(false)
      }
    }
  }, [])

  const loadScheduled = useCallback(async (): Promise<void> => {
    const seq = ++scheduledSeq.current
    setScheduledLoading(true)
    setScheduledError(null)
    try {
      const response = await listHomepagePublications({
        status: 'SCHEDULED',
        page: 1,
        limit: 5,
      })
      if (isActive(seq, scheduledSeq)) {
        setScheduled(response)
      }
    } catch (error) {
      if (isActive(seq, scheduledSeq)) {
        setScheduledError(error)
      }
    } finally {
      if (isActive(seq, scheduledSeq)) {
        setScheduledLoading(false)
      }
    }
  }, [])

  const loadValidation = useCallback(async (): Promise<void> => {
    const seq = ++validationSeq.current
    setValidationLoading(true)
    setValidationError(null)
    setDraftValidation(null)
    try {
      const result = await validateHomepageDraft({})
      if (isActive(seq, validationSeq)) {
        setDraftValidation(result)
      }
    } catch (error) {
      if (isActive(seq, validationSeq)) {
        setValidationError(error)
      }
    } finally {
      if (isActive(seq, validationSeq)) {
        setValidationLoading(false)
      }
    }
  }, [])

  const loadDraft = useCallback(async (): Promise<void> => {
    const seq = ++draftSeq.current
    // A new draft read invalidates any in-flight validation.
    validationSeq.current += 1
    setDraftLoading(true)
    setDraftError(null)
    setDraftValidation(null)
    setValidationLoading(false)
    setValidationError(null)
    try {
      const data = await getHomepageDraft()
      if (!isActive(seq, draftSeq)) {
        return
      }
      setDraft(data)
      await loadValidation()
    } catch (error) {
      if (isActive(seq, draftSeq)) {
        setDraftError(error)
      }
    } finally {
      if (isActive(seq, draftSeq)) {
        setDraftLoading(false)
      }
    }
  }, [loadValidation])

  const loadCampaigns = useCallback(async (): Promise<void> => {
    const seq = ++campaignsSeq.current
    setCampaignsLoading(true)
    setCampaignsError(null)
    try {
      const response = await listMerchCampaigns({
        page: 1,
        limit: 5,
      })
      if (isActive(seq, campaignsSeq)) {
        setCampaigns(response)
      }
    } catch (error) {
      if (isActive(seq, campaignsSeq)) {
        setCampaignsError(error)
      }
    } finally {
      if (isActive(seq, campaignsSeq)) {
        setCampaignsLoading(false)
      }
    }
  }, [])

  const loadMedia = useCallback(async (): Promise<void> => {
    const seq = ++mediaSeq.current
    setMediaLoading(true)
    setMediaError(null)
    try {
      const response = await listMerchMedia({
        page: 1,
        limit: 5,
      })
      if (isActive(seq, mediaSeq)) {
        setMedia(response)
      }
    } catch (error) {
      if (isActive(seq, mediaSeq)) {
        setMediaError(error)
      }
    } finally {
      if (isActive(seq, mediaSeq)) {
        setMediaLoading(false)
      }
    }
  }, [])

  const refreshAll = useCallback((): void => {
    void loadCurrent()
    void loadScheduled()
    void loadDraft()
    void loadCampaigns()
    void loadMedia()
  }, [loadCampaigns, loadCurrent, loadDraft, loadMedia, loadScheduled])

  useEffect(() => {
    mountedRef.current = true
    if (!initializedRef.current) {
      initializedRef.current = true
      refreshAll()
    }
    return () => {
      mountedRef.current = false
    }
  }, [refreshAll])

  return {
    currentPublication: section(
      currentPublication,
      currentLoading,
      currentError,
      () => void loadCurrent(),
    ),
    scheduledPublications: section(
      scheduled,
      scheduledLoading,
      scheduledError,
      () => void loadScheduled(),
    ),
    draft: section(draft, draftLoading, draftError, () => void loadDraft()),
    draftValidation: section(
      draftValidation,
      validationLoading,
      validationError,
      () => void loadValidation(),
    ),
    campaigns: section(
      campaigns,
      campaignsLoading,
      campaignsError,
      () => void loadCampaigns(),
    ),
    media: section(media, mediaLoading, mediaError, () => void loadMedia()),
    refreshAll,
  }
}
