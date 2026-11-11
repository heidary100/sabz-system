import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  HomepageDraftDto,
  HomepageDraftSection,
  HomepageDraftValidationResult,
} from '@sabz/types'
import {
  cloneSections,
  normalizeSectionOrder,
  sectionsEqual,
} from '../lib/merchandising-homepage'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../lib/merchandising-errors'
import {
  getHomepageDraft,
  replaceHomepageDraft,
  validateHomepageDraft,
} from '../services/merchandising'

export type HomepageValidationTarget = 'local' | 'server'

export interface HomepageDraftConflict {
  errorCode: string | null
  message: string
  localRevision: number | null
  currentRevision: number | null
  currentSchemaVersion: number | null
  currentUpdatedAt: string | null
}

export function useHomepageDraft() {
  const [serverDraft, setServerDraft] = useState<HomepageDraftDto | null>(null)
  const [sections, setSections] = useState<HomepageDraftSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] =
    useState<HomepageDraftValidationResult | null>(null)
  const [validationRun, setValidationRun] = useState(0)
  const [validationTarget, setValidationTarget] =
    useState<HomepageValidationTarget | null>(null)
  const [validationDocumentKey, setValidationDocumentKey] = useState<
    string | null
  >(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<HomepageDraftConflict | null>(null)

  const requestSeq = useRef(0)
  const initializedRef = useRef(false)
  const savingRef = useRef(false)
  const validatingRef = useRef(false)

  const load = useCallback(async (): Promise<void> => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getHomepageDraft()
      if (seq !== requestSeq.current) {
        return
      }
      const normalized = normalizeSectionOrder(data.sections)
      setServerDraft({ ...data, sections: normalized })
      setSections(cloneSections(normalized))
      setConflict(null)
      setSaveError(null)
      setSaveMessage(null)
      setValidation(null)
      setValidationTarget(null)
      setValidationDocumentKey(null)
      setValidationError(null)
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [])

  // Avoid a duplicate initialization request when StrictMode double-invokes
  // effects. A true remount receives a fresh ref and loads normally.
  useEffect(() => {
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true
    void load()
  }, [load])

  const updateSections = useCallback((next: HomepageDraftSection[]): void => {
    setSections(normalizeSectionOrder(next))
    setSaveError(null)
    setSaveMessage(null)
  }, [])

  /**
   * Apply a server-authoritative validation result returned by publication.
   * This keeps the single validation store used by the editor/validation panel
   * instead of creating a second publication-only error state.
   */
  const applyValidationResult = useCallback(
    (result: HomepageDraftValidationResult): void => {
      setValidation(result)
      setValidationRun((run) => run + 1)
      setValidationTarget('server')
      setValidationDocumentKey(JSON.stringify(sections))
      setValidationError(null)
    },
    [sections],
  )

  const dirty = useMemo(
    () => (serverDraft ? !sectionsEqual(sections, serverDraft.sections) : false),
    [serverDraft, sections],
  )

  const validationOutdated = useMemo(
    () =>
      validation !== null &&
      validationDocumentKey !== JSON.stringify(sections),
    [validation, validationDocumentKey, sections],
  )

  const save = useCallback(async (): Promise<boolean> => {
    if (!serverDraft || savingRef.current || conflict) {
      return false
    }
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const data = await replaceHomepageDraft({
        revision: serverDraft.revision,
        sections,
      })
      const normalized = normalizeSectionOrder(data.sections)
      setServerDraft({ ...data, sections: normalized })
      setSections(cloneSections(normalized))
      setConflict(null)
      setValidation(null)
      setValidationTarget(null)
      setValidationDocumentKey(null)
      setValidationError(null)
      setSaveMessage('پیش‌نویس صفحه اصلی ذخیره شد.')
      return true
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      if (parsed?.status === 409) {
        setConflict({
          errorCode: parsed.errorCode,
          message:
            parsed.message ??
            'نسخه پیش‌نویس روی سرور تغییر کرده است؛ نسخه تازه را بارگذاری کنید.',
          localRevision: serverDraft.revision,
          currentRevision: parsed.currentRevision ?? null,
          currentSchemaVersion: parsed.currentSchemaVersion ?? null,
          currentUpdatedAt: parsed.currentUpdatedAt ?? null,
        })
      }
      setSaveError(merchandisingErrorMessage(error))
      return false
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [serverDraft, sections, conflict])

  const validate = useCallback(async (): Promise<void> => {
    if (!serverDraft || validatingRef.current) {
      return
    }
    const target: HomepageValidationTarget = dirty ? 'local' : 'server'
    const documentKey = JSON.stringify(sections)
    validatingRef.current = true
    setValidating(true)
    setValidationError(null)
    try {
      const result = await validateHomepageDraft(
        target === 'local'
          ? { sections }
          : { revision: serverDraft.revision },
      )
      setValidation(result)
      setValidationRun((run) => run + 1)
      setValidationTarget(target)
      setValidationDocumentKey(documentKey)
      if (result.revision !== serverDraft.revision) {
        setConflict({
          errorCode: 'SERVER_REVISION_ADVANCED',
          message:
            'در هنگام اعتبارسنجی مشخص شد نسخه پیش‌نویس روی سرور جلوتر رفته است.',
          localRevision: serverDraft.revision,
          currentRevision: result.revision,
          currentSchemaVersion: result.schemaVersion,
          currentUpdatedAt: null,
        })
      }
    } catch (error) {
      const parsed = parseMerchandisingError(error)
      if (parsed?.status === 409) {
        setConflict({
          errorCode: parsed.errorCode,
          message:
            parsed.message ??
            'نسخه پیش‌نویس روی سرور تغییر کرده است؛ نسخه تازه را بارگذاری کنید.',
          localRevision: serverDraft.revision,
          currentRevision: parsed.currentRevision ?? null,
          currentSchemaVersion: parsed.currentSchemaVersion ?? null,
          currentUpdatedAt: parsed.currentUpdatedAt ?? null,
        })
      }
      setValidationError(merchandisingErrorMessage(error))
    } finally {
      validatingRef.current = false
      setValidating(false)
    }
  }, [serverDraft, sections, dirty])

  return {
    serverDraft,
    sections,
    revision: serverDraft?.revision ?? null,
    schemaVersion: serverDraft?.schemaVersion ?? null,
    serverUpdatedAt: serverDraft?.updatedAt ?? null,
    loading,
    error,
    dirty,
    saving,
    saveError,
    saveMessage,
    conflict,
    validating,
    validation,
    validationRun,
    validationTarget,
    validationOutdated,
    validationError,
    updateSections,
    applyValidationResult,
    load,
    save,
    validate,
  }
}
