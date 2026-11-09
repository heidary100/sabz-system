import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  HOMEPAGE_MAX_SECTIONS,
  type HomepageDraftSection,
  type HomepagePublicationDto,
  type HomepageSectionType,
} from '@sabz/types'
import { Button } from '../../components/catalyst/button'
import { Text } from '../../components/catalyst/text'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { InlineError } from '../../components/ui/inline-error'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { StatusBadge } from '../../components/ui/status-badge'
import { HomepageSectionConfigPanel } from '../../components/merchandising/homepage/homepage-section-config-panel'
import { HomepageSectionOutline } from '../../components/merchandising/homepage/homepage-section-outline'
import { HomepageValidationPanel } from '../../components/merchandising/homepage/homepage-validation-panel'
import { HomepagePublicationSection } from '../../components/merchandising/homepage/homepage-publication-section'
import { HomepageCampaignPickerDialog } from '../../components/merchandising/homepage/homepage-campaign-picker-dialog'
import { HomepageCampaignSectionCreateDialog } from '../../components/merchandising/homepage/homepage-campaign-section-create-dialog'
import { useAuth } from '../../auth/auth-provider'
import { UNSAVED_DRAFT_MESSAGE, useDirtyNavigationGuard } from '../../hooks/use-dirty-navigation-guard'
import { useHomepageDraft } from '../../hooks/use-homepage-draft'
import { formatDateTime } from '../../lib/format'
import {
  appendHomepageSection,
  appendHomepageSectionWithSettings,
  HOMEPAGE_SECTION_REGISTRY,
  moveHomepageSection,
  removeHomepageSection,
  sectionIndexFromValidationPath,
  sectionTypeLabel,
  toggleSectionVisibility,
} from '../../lib/merchandising-homepage'
import { translateApiError } from '../../lib/error-messages'

export function MerchandisingHomepagePage() {
  const {
    serverDraft,
    sections,
    revision,
    schemaVersion,
    serverUpdatedAt,
    loading,
    error,
    dirty,
    saving,
    saveError,
    saveMessage,
    conflict,
    validating,
    validation,
    validationTarget,
    validationOutdated,
    validationError,
    updateSections,
    applyValidationResult,
    load,
    save,
    validate,
  } = useHomepageDraft()
  const { user } = useAuth()
  const navigate = useNavigate()
  const canPublish = user?.roles.includes('ADMIN') ?? false
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [localMessage, setLocalMessage] = useState<string | null>(null)
  const [pendingAddType, setPendingAddType] = useState<HomepageSectionType | null>(null)
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(null)
  const [addCampaignPickerOpen, setAddCampaignPickerOpen] = useState(false)
  const [addCreateDialogOpen, setAddCreateDialogOpen] = useState(false)

  useDirtyNavigationGuard(dirty)

  const selectedIndex = useMemo(
    () => (selectedKey ? sections.findIndex((section) => section.key === selectedKey) : -1),
    [sections, selectedKey],
  )
  const selectedSection: HomepageDraftSection | null =
    selectedIndex >= 0 ? sections[selectedIndex] ?? null : null
  const selectedIssues =
    validation && !validationOutdated && selectedIndex >= 0
      ? [...validation.errors, ...validation.warnings].filter(
          (issue) =>
            sectionIndexFromValidationPath(issue.path) === selectedIndex,
        )
      : []

  useEffect(() => {
    if (selectedKey && !sections.some((section) => section.key === selectedKey)) {
      setSelectedKey(null)
    }
  }, [sections, selectedKey])

  const handleAdd = (type: HomepageSectionType): string | null => {
    if (sections.length >= HOMEPAGE_MAX_SECTIONS) {
      return `حداکثر ${HOMEPAGE_MAX_SECTIONS.toLocaleString('fa-IR')} بخش مجاز است.`
    }
    if (HOMEPAGE_SECTION_REGISTRY[type].requiresInitialCampaign) {
      setPendingAddType(type)
      setPendingCampaignId(null)
      setAddCampaignPickerOpen(true)
      return null
    }
    const result = appendHomepageSection(sections, type)
    if ('error' in result) {
      return result.error
    }
    updateSections(result.sections)
    const added = result.sections[result.index]
    setSelectedKey(added?.key ?? null)
    setLocalMessage(`بخش «${sectionTypeLabel(type)}» اضافه شد.`)
    return null
  }

  const closeAddFlow = (): void => {
    setAddCampaignPickerOpen(false)
    setAddCreateDialogOpen(false)
    setPendingAddType(null)
    setPendingCampaignId(null)
  }

  const handleCreateCampaignSection = (
    settings: HomepageDraftSection['settings'],
  ): string | null => {
    if (!pendingAddType) {
      return 'نوع بخش انتخاب نشده است.'
    }
    const result = appendHomepageSectionWithSettings(
      sections,
      pendingAddType,
      settings,
    )
    if ('error' in result) {
      return result.error
    }
    updateSections(result.sections)
    const added = result.sections[result.index]
    setSelectedKey(added?.key ?? null)
    setLocalMessage(`بخش «${sectionTypeLabel(pendingAddType)}» ایجاد شد.`)
    closeAddFlow()
    return null
  }

  const handleMove = (index: number, direction: -1 | 1): void => {
    const next = moveHomepageSection(sections, index, direction)
    if (next !== sections) {
      updateSections(next)
    }
  }

  const handleRemove = (index: number): void => {
    const removedKey = sections[index]?.key
    updateSections(removeHomepageSection(sections, index))
    if (removedKey && removedKey === selectedKey) {
      setSelectedKey(null)
    }
  }

  const handleToggleVisibility = (index: number): void => {
    updateSections(toggleSectionVisibility(sections, index))
  }

  const reloadFromServer = (): void => {
    if (
      !dirty ||
      window.confirm(UNSAVED_DRAFT_MESSAGE)
    ) {
      setSelectedKey(null)
      setLocalMessage(null)
      void load()
    }
  }

  const handleValidate = (): void => {
    setLocalMessage(null)
    void validate()
  }

  const handleSave = (): void => {
    setLocalMessage(null)
    void save()
  }

  const handlePublished = async (
    publication: HomepagePublicationDto,
    meta: { expectedRevision: number; revisionMismatch: boolean },
  ): Promise<void> => {
    setLocalMessage(null)
    // Refresh the server-backed draft state before leaving the editor. The
    // publication itself does not mutate the draft revision, but a reload keeps
    // the editor and readiness card consistent with the server.
    await load()
    navigate(`/merchandising/publications/${publication.id}`, {
      state: {
        justPublished: publication.status === 'PUBLISHED',
        justScheduled: publication.status === 'SCHEDULED',
        publication,
        ...meta,
      },
    })
  }

  const selectFromValidation = (index: number): void => {
    const section = sections[index]
    if (!section) {
      return
    }
    setSelectedKey(section.key)
    const row = document.getElementById(`homepage-section-row-${index}`)
    const button = row?.querySelector<HTMLButtonElement>('button')
    button?.focus()
    button?.scrollIntoView?.({ block: 'center' })
  }

  const statusBadge = conflict ? (
    <StatusBadge tone="danger">تعارض نسخه</StatusBadge>
  ) : dirty ? (
    <StatusBadge tone="warning">تغییرات ذخیره‌نشده</StatusBadge>
  ) : (
    <StatusBadge tone="success">ذخیره‌شده</StatusBadge>
  )

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        title="صفحه اصلی"
        subtitle="ویرایش ساختار پیش‌نویس صفحه اصلی؛ انتشار عمومی فقط از نسخه‌های انتشار انجام می‌شود."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              outline
              disabled={!serverDraft || saving || validating}
              onClick={handleValidate}
            >
              {validating ? 'در حال اعتبارسنجی…' : 'اعتبارسنجی'}
            </Button>
            <Button
              color="primary"
              disabled={!serverDraft || !dirty || saving || !!conflict}
              onClick={handleSave}
            >
              {saving ? 'در حال ذخیره…' : 'ذخیره پیش‌نویس'}
            </Button>
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs text-muted">نسخه پیش‌نویس</p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {revision === null ? '—' : revision.toLocaleString('fa-IR')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">نسخه ساختار</p>
            <p className="text-sm text-foreground">
              {schemaVersion === null
                ? '—'
                : schemaVersion.toLocaleString('fa-IR')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">آخرین تغییر سرور</p>
            <p className="text-sm text-foreground">
              {formatDateTime(serverUpdatedAt)}
            </p>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {statusBadge}
            <StatusBadge tone={validationOutdated ? 'warning' : 'neutral'}>
              {validation
                ? validationOutdated
                  ? 'اعتبارسنجی قدیمی'
                  : 'اعتبارسنجی موجود'
                : 'بدون اعتبارسنجی'}
            </StatusBadge>
          </div>
        </div>
      </div>

      {conflict && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-danger-border bg-danger-subtle p-4"
        >
          <div>
            <p className="text-sm font-semibold text-danger">
              نسخه پیش‌نویس روی سرور جلوتر رفته است.
            </p>
            <p className="mt-1 text-sm text-foreground">
              {conflict.message} نسخه محلی شما حفظ شده است و تا بارگذاری نسخه
              تازه سرور، ذخیره غیرفعال است. ادغام خودکار انجام نمی‌شود.
            </p>
            <p className="mt-2 text-xs text-muted">
              نسخه محلی: {conflict.localRevision?.toLocaleString('fa-IR') ?? '—'} ·
              نسخه سرور:{' '}
              {conflict.currentRevision?.toLocaleString('fa-IR') ?? 'نامشخص'}
              {conflict.currentUpdatedAt
                ? ` · ${formatDateTime(conflict.currentUpdatedAt)}`
                : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              outline
              onClick={() => {
                if (window.confirm(UNSAVED_DRAFT_MESSAGE)) {
                  setSelectedKey(null)
                  setLocalMessage(null)
                  void load()
                }
              }}
            >
              بارگذاری نسخه سرور و کنار گذاشتن تغییرات محلی
            </Button>
            <Text className="self-center text-xs text-muted">
              می‌توانید نسخه محلی را بررسی کنید، اما ذخیره تا دریافت نسخه تازه
              ممکن نیست.
            </Text>
          </div>
        </div>
      )}

      {error && serverDraft ? (
        <InlineError
          message={`${translateApiError(error)} — نسخه محلی حفظ شده است.`}
        />
      ) : null}
      {saveError && <InlineError message={saveError} />}
      {saveMessage && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {saveMessage}
        </p>
      )}
      {localMessage && (
        <p
          role="status"
          className="rounded-lg bg-primary-subtle px-3 py-2 text-sm text-primary"
        >
          {localMessage}
        </p>
      )}

      {loading && !serverDraft ? (
        <Loading compact label="در حال بارگذاری پیش‌نویس صفحه اصلی…" />
      ) : error && !serverDraft ? (
        <ErrorState
          message={translateApiError(error)}
          onRetry={() => void load()}
        />
      ) : !serverDraft ? (
        <EmptyState
          title="پیش‌نویس صفحه اصلی در دسترس نیست"
          description="دوباره تلاش کنید یا دسترسی خود را بررسی نمایید."
          actions={
            <Button outline onClick={() => void load()}>
              تلاش مجدد
            </Button>
          }
        />
      ) : (
        <>
          {loading && (
            <div
              role="status"
              className="flex items-center justify-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted"
            >
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-hunter-800 border-t-primary motion-reduce:animate-none"
              />
              در حال بازخوانی نسخه سرور…
            </div>
          )}

          <HomepagePublicationSection
            revision={revision}
            schemaVersion={schemaVersion}
            sections={sections}
            loading={loading}
            dirty={dirty}
            saving={saving}
            conflict={conflict}
            validating={validating}
            validation={validation}
            validationTarget={validationTarget}
            validationOutdated={validationOutdated}
            canPublish={canPublish}
            onSave={handleSave}
            onValidate={handleValidate}
            onValidationFromPublication={applyValidationResult}
            onPublished={handlePublished}
            onSelectSection={selectFromValidation}
            onReloadDraft={reloadFromServer}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <HomepageSectionOutline
              sections={sections}
              selectedKey={selectedKey}
              validation={validation}
              disabled={saving || loading}
              maxSections={HOMEPAGE_MAX_SECTIONS}
              onSelect={setSelectedKey}
              onAdd={handleAdd}
              onMove={handleMove}
              onRemove={handleRemove}
              onToggleVisibility={handleToggleVisibility}
            />
            <HomepageSectionConfigPanel
              section={selectedSection}
              index={selectedIndex}
              issues={selectedIssues}
              disabled={saving || loading}
              onToggleVisibility={() => {
                if (selectedIndex >= 0) {
                  handleToggleVisibility(selectedIndex)
                }
              }}
              onChange={(next) => {
                if (selectedIndex < 0) {
                  return
                }
                updateSections(
                  sections.map((section, index) =>
                    index === selectedIndex ? next : section,
                  ),
                )
              }}
            />
          </div>

          <HomepageValidationPanel
            validation={validation}
            target={validationTarget}
            outdated={validationOutdated}
            validationError={validationError}
            sections={sections}
            onSelectSection={selectFromValidation}
          />

          {(dirty || saving) && (
            <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
              <Text className="text-sm font-medium text-foreground">
                {saving
                  ? 'در حال ذخیره پیش‌نویس…'
                  : 'تغییرات ذخیره‌نشده‌ای وجود دارد.'}
              </Text>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                <Button
                  outline
                  disabled={saving}
                  onClick={reloadFromServer}
                >
                  بازخوانی از سرور
                </Button>
                <Button
                  color="primary"
                  disabled={saving || !!conflict}
                  onClick={handleSave}
                >
                  {saving ? 'در حال ذخیره…' : 'ذخیره پیش‌نویس'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <HomepageCampaignPickerDialog
        open={addCampaignPickerOpen}
        selectedIds={[]}
        maxReached={false}
        pickLabel="انتخاب"
        onPick={(campaign) => {
          setPendingCampaignId(campaign.id)
          setAddCampaignPickerOpen(false)
          setAddCreateDialogOpen(true)
        }}
        onClose={closeAddFlow}
      />
      <HomepageCampaignSectionCreateDialog
        open={addCreateDialogOpen}
        type={pendingAddType}
        campaignId={pendingCampaignId}
        onClose={closeAddFlow}
        onCreate={handleCreateCampaignSection}
      />
    </div>
  )
}
