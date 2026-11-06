import { Button } from '../catalyst/button'

/**
 * Unsaved-changes indicator for the catalog grid (SS-257). States it
 * communicates honestly: unsaved rows exist (count), a save is in progress,
 * and rows failed or need attention. It never implies persistence before
 * the API confirms — failed rows are counted out loud, and the saved count
 * only appears after row-level SUCCESS outcomes arrive.
 */
export interface UnsavedChangesBarProps {
  dirtyCount: number
  saving: boolean
  savingCount: number
  failedCount: number
  succeededCount: number
  requestError: string | null
  onSave: () => void
  onDiscard: () => void
}

export function UnsavedChangesBar({
  dirtyCount,
  saving,
  savingCount,
  failedCount,
  succeededCount,
  requestError,
  onSave,
  onDiscard,
}: UnsavedChangesBarProps) {
  if (dirtyCount === 0 && failedCount === 0 && succeededCount === 0 && !requestError) {
    return null
  }

  return (
    <div
      role="status"
      className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-sm"
    >
      <p className="text-sm font-medium text-foreground">
        {dirtyCount > 0
          ? `${dirtyCount} ردیف تغییر ذخیرهنشده دارد`
          : failedCount > 0
            ? `${failedCount} ردیف نیازمند بررسی است`
            : succeededCount > 0
              ? `${succeededCount} ردیف با موفقیت ذخیره شد`
              : ''}
      </p>
      {saving && savingCount > 0 ? (
        <span className="flex items-center gap-2 text-sm text-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-hunter-800 border-t-primary"
          />
          در حال ذخیره {savingCount} ردیف…
        </span>
      ) : null}
      {failedCount > 0 ? (
        <span className="text-sm text-red-600">{failedCount} ردیف ذخیره نشد</span>
      ) : null}
      {requestError ? <span className="text-sm text-red-600">{requestError}</span> : null}
      <div className="ms-auto flex items-center gap-2">
        <Button outline onClick={onDiscard} disabled={saving || dirtyCount === 0}>
          لغو تغییرات
        </Button>
        <Button color="primary" onClick={onSave} disabled={saving || dirtyCount === 0}>
          ذخیره تغییرات
        </Button>
      </div>
    </div>
  )
}
