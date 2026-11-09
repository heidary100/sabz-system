import { useEffect, useMemo, useState } from 'react'
import type {
  HomepageDraftSection,
  HomepageDraftValidationResult,
  HomepagePublicationDto,
} from '@sabz/types'
import { HomepagePublishDialog } from './homepage-publish-dialog'
import { HomepageScheduleDialog } from './homepage-schedule-dialog'
import { HomepageReadinessCard } from './homepage-readiness-card'
import { useHomepagePublication } from '../../../hooks/use-homepage-publication'
import type {
  HomepageDraftConflict,
  HomepageValidationTarget,
} from '../../../hooks/use-homepage-draft'
import { deriveHomepageReadiness } from '../../../lib/merchandising-publication'

export function HomepagePublicationSection({
  revision,
  schemaVersion,
  sections,
  loading,
  dirty,
  saving,
  conflict,
  validating,
  validation,
  validationTarget,
  validationOutdated,
  canPublish,
  onSave,
  onValidate,
  onValidationFromPublication,
  onPublished,
  onSelectSection,
  onReloadDraft,
}: {
  revision: number | null
  schemaVersion: number | null
  sections: HomepageDraftSection[]
  loading: boolean
  dirty: boolean
  saving: boolean
  conflict: HomepageDraftConflict | null
  validating: boolean
  validation: HomepageDraftValidationResult | null
  validationTarget: HomepageValidationTarget | null
  validationOutdated: boolean
  canPublish: boolean
  onSave: () => void
  onValidate: () => void
  onValidationFromPublication: (
    result: HomepageDraftValidationResult,
  ) => void
  onPublished: (
    publication: HomepagePublicationDto,
    meta: { expectedRevision: number; revisionMismatch: boolean },
  ) => Promise<void> | void
  onSelectSection: (index: number) => void
  onReloadDraft: () => void
}) {
  const {
    current,
    currentLoading,
    currentError,
    publishing,
    refreshCurrent,
    publish,
    schedule,
  } = useHomepagePublication()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [published, setPublished] = useState<HomepagePublicationDto | null>(
    null,
  )
  const [publicationConflict, setPublicationConflict] = useState(false)

  useEffect(() => {
    if (dirty) {
      setPublished(null)
    }
  }, [dirty])

  useEffect(() => {
    setPublished(null)
    setPublicationConflict(false)
  }, [revision])

  const readiness = useMemo(
    () =>
      deriveHomepageReadiness({
        hasDraft: revision !== null,
        loading,
        revision,
        schemaVersion,
        dirty,
        saving,
        conflict: conflict !== null,
        validating,
        validation,
        validationTarget,
        validationOutdated,
        publishing,
      }),
    [
      revision,
      schemaVersion,
      loading,
      dirty,
      saving,
      conflict,
      validating,
      validation,
      validationTarget,
      validationOutdated,
      publishing,
    ],
  )

  const warnings = readiness.publishable ? validation?.warnings ?? [] : []

  const handleConfirm = async (note: string | null): Promise<void> => {
    if (revision === null || publishing) {
      return
    }
    setDialogError(null)
    setPublicationConflict(false)
    const result = await publish({ note, expectedRevision: revision })
    switch (result.status) {
      case 'success':
        setDialogOpen(false)
        setPublicationConflict(false)
        setPublished(result.publication)
        await onPublished(result.publication, {
          expectedRevision: result.expectedRevision,
          revisionMismatch: result.revisionMismatch,
        })
        return
      case 'invalid':
        setPublicationConflict(false)
        onValidationFromPublication({
          revision,
          schemaVersion: schemaVersion ?? 1,
          valid: result.errors.length === 0,
          errors: result.errors,
          warnings: result.warnings,
        })
        setDialogError(result.message)
        return
      case 'conflict':
        setPublicationConflict(true)
        setDialogError(result.message)
        return
      case 'busy':
      case 'forbidden':
      case 'ambiguous':
      case 'error':
        setDialogError(result.message)
        return
    }
  }

  const handleScheduleConfirm = async (input: {
    publishAt: string
    note: string | null
  }): Promise<void> => {
    if (revision === null || publishing) {
      return
    }
    setScheduleError(null)
    setPublicationConflict(false)
    const result = await schedule({
      publishAt: input.publishAt,
      note: input.note,
      expectedRevision: revision,
    })
    switch (result.status) {
      case 'success':
        setScheduleOpen(false)
        setPublicationConflict(false)
        setPublished(result.publication)
        await onPublished(result.publication, {
          expectedRevision: result.expectedRevision,
          revisionMismatch: result.revisionMismatch,
        })
        return
      case 'invalid':
        onValidationFromPublication({
          revision,
          schemaVersion: schemaVersion ?? 1,
          valid: result.errors.length === 0,
          errors: result.errors,
          warnings: result.warnings,
        })
        setScheduleError(result.message)
        return
      case 'conflict':
        setPublicationConflict(true)
        setScheduleError(result.message)
        return
      case 'busy':
      case 'forbidden':
      case 'ambiguous':
      case 'error':
        setScheduleError(result.message)
        return
    }
  }

  return (
    <>
      <HomepageReadinessCard
        revision={revision}
        schemaVersion={schemaVersion}
        sectionCount={sections.length}
        readiness={readiness}
        validation={validation}
        localValidation={validationTarget === 'local'}
        currentPublication={current}
        currentLoading={currentLoading}
        currentError={currentError}
        publishing={publishing}
        publishedPublication={published}
        canPublish={canPublish}
        publicationConflict={publicationConflict}
        onSave={onSave}
        onValidate={onValidate}
        onPublish={() => {
          setDialogError(null)
          setDialogOpen(true)
        }}
        onSchedule={() => {
          setScheduleError(null)
          setScheduleOpen(true)
        }}
        onSelectSection={onSelectSection}
        onReloadDraft={onReloadDraft}
        onRefreshCurrent={() => void refreshCurrent()}
      />

      {revision !== null && (
        <>
          <HomepagePublishDialog
            open={dialogOpen}
            revision={revision}
            sectionCount={sections.length}
            currentPublishedAt={current?.publishedAt ?? null}
            warnings={warnings}
            submitting={publishing}
            error={dialogError}
            onClose={() => {
              if (!publishing) {
                setDialogOpen(false)
              }
            }}
            onConfirm={(note) => void handleConfirm(note)}
          />
          <HomepageScheduleDialog
            open={scheduleOpen}
            revision={revision}
            sectionCount={sections.length}
            warnings={warnings}
            submitting={publishing}
            error={scheduleError}
            onClose={() => {
              if (!publishing) {
                setScheduleOpen(false)
              }
            }}
            onConfirm={(input) => void handleScheduleConfirm(input)}
          />
        </>
      )}
    </>
  )
}
