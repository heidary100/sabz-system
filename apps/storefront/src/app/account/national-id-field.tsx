'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import { toEnglishDigits } from '@/lib/digits';
import {
  NATIONAL_ID_MESSAGES,
  nationalIdMessage,
  validateNationalId,
} from '@/lib/national-id';

const inputClassName =
  'min-h-11 w-full rounded-md border border-sand-200 bg-white px-3 text-left text-sm tabular-nums tracking-[0.08em] text-ink-900 placeholder:tracking-normal placeholder:text-gray-400';

export interface NationalIdSummary {
  hasNationalId: boolean;
  maskedNationalId: string | null;
}

export interface NationalIdFieldProps {
  hasNationalId: boolean;
  maskedNationalId: string | null;
  onSave: (value: string) => Promise<NationalIdSummary>;
  onUnauthorized: () => void;
}

/**
 * Focused account-panel National ID field (SS-260). The server is
 * authoritative; this component only provides immediate advisory feedback and
 * never retains the full value after a successful save.
 */
export function NationalIdField({
  hasNationalId,
  maskedNationalId,
  onSave,
  onUnauthorized,
}: NationalIdFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const focusOnEditRef = useRef(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Derive editability from the parent's safe state. If a later profile
  // response discovers an existing value, the form closes automatically
  // instead of continuing to claim the user is unregistered.
  const editing = !hasNationalId || editorOpen;

  // Focus only after an explicit "change" action, never on initial mount.
  useEffect(() => {
    if (editing && focusOnEditRef.current) {
      focusOnEditRef.current = false;
      inputRef.current?.focus();
    }
  }, [editing]);

  function handleChange(next: string): void {
    // Fold supported digits as they are typed, but never strip separators or
    // other characters: validation must reject them visibly.
    setValue(toEnglishDigits(next));
    setError(null);
    setNotice(null);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>): void {
    const pasted = event.clipboardData.getData('text');
    if (pasted === '') {
      return;
    }
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    handleChange(
      `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`,
    );
  }

  function startEditing(): void {
    focusOnEditRef.current = true;
    setEditorOpen(true);
    setValue('');
    setError(null);
    setNotice(null);
  }

  function cancelEditing(): void {
    if (!hasNationalId) {
      setValue('');
      setError(null);
      return;
    }
    setEditorOpen(false);
    setValue('');
    setError(null);
    setNotice(null);
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) {
      return;
    }

    const result = validateNationalId(value);
    if (result.status !== 'valid') {
      setError(nationalIdMessage(result.status));
      inputRef.current?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await onSave(result.value);
      setValue('');
      setEditorOpen(false);
      setNotice(NATIONAL_ID_MESSAGES.saved);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        onUnauthorized();
        return;
      }
      if (saveError instanceof ApiError) {
        setError(
          saveError.message !== ''
            ? saveError.message
            : NATIONAL_ID_MESSAGES.saveFailed,
        );
      } else {
        setError(NATIONAL_ID_MESSAGES.networkError);
      }
    } finally {
      setSaving(false);
    }
  }

  const liveStatus = validateNationalId(value);
  const showLiveValid =
    value !== '' && liveStatus.status === 'valid' && error === null;
  const errorId = 'account-nationalId-error';
  const helpId = 'account-nationalId-help';

  return (
    <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
      <h2 className="text-sm font-bold text-ink-900">اطلاعات هویتی</h2>

      {!editing ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500">{NATIONAL_ID_MESSAGES.savedState}</p>
            <p
              dir="ltr"
              className="mt-1 text-left text-base font-semibold tabular-nums tracking-[0.12em] text-ink-900"
            >
              {maskedNationalId ?? '****'}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              برای حفظ حریم خصوصی، فقط چهار رقم آخر نمایش داده می‌شود.
            </p>
          </div>
          <Button variant="outline" onClick={startEditing}>
            {NATIONAL_ID_MESSAGES.change}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-3" noValidate>
          {!hasNationalId && (
            <p className="text-xs text-gray-500">
              {NATIONAL_ID_MESSAGES.unsetState}
            </p>
          )}
          {hasNationalId && (
            <p className="text-xs text-gray-500">
              کد ملی فعلی: <span dir="ltr">{maskedNationalId ?? '****'}</span>
            </p>
          )}
          <div>
            <label
              htmlFor="account-nationalId"
              className="mb-1 block text-sm font-semibold text-ink-900"
            >
              {NATIONAL_ID_MESSAGES.label}
            </label>
            <input
              ref={inputRef}
              id="account-nationalId"
              name="nationalId"
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={10}
              placeholder="۱۰ رقم"
              value={value}
              onChange={(event) => handleChange(event.target.value)}
              onPaste={handlePaste}
              onBlur={() => {
                if (value !== '') {
                  const result = validateNationalId(value);
                  if (result.status !== 'valid') {
                    setError(nationalIdMessage(result.status));
                  }
                }
              }}
              aria-invalid={error !== null}
              aria-describedby={`${helpId}${error !== null ? ` ${errorId}` : ''}`}
              className={inputClassName}
            />
            <p id={helpId} className="mt-1.5 text-xs leading-5 text-gray-500">
              {hasNationalId
                ? NATIONAL_ID_MESSAGES.replacementNote
                : NATIONAL_ID_MESSAGES.helper}
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {NATIONAL_ID_MESSAGES.disclaimer}
            </p>
            {showLiveValid && (
              <p
                role="status"
                className="mt-1.5 text-xs font-medium text-sabz-700"
              >
                {NATIONAL_ID_MESSAGES.valid}
              </p>
            )}
            {error !== null && (
              <p
                id={errorId}
                role="alert"
                className="mt-1.5 text-xs font-medium text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? NATIONAL_ID_MESSAGES.saving : NATIONAL_ID_MESSAGES.save}
            </Button>
            {hasNationalId && (
              <Button
                type="button"
                variant="ghost"
                onClick={cancelEditing}
                disabled={saving}
              >
                {NATIONAL_ID_MESSAGES.cancel}
              </Button>
            )}
          </div>
        </form>
      )}

      {notice !== null && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-sabz-50 px-3 py-2.5 text-sm font-medium text-sabz-700 ring-1 ring-inset ring-sabz-200 motion-reduce:animate-none"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
