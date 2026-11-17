import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HomepagePublicationDto,
  HomepagePublicationSummaryDto,
  HomepageValidationIssue,
} from '@sabz/types'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../lib/merchandising-errors'
import { parseHomepageValidationIssues } from '../lib/merchandising-publication'
import {
  createHomepagePublication,
  getHomepageDraft,
  listHomepagePublications,
} from '../services/merchandising'

export type HomepagePublishResult =
  | {
      status: 'success'
      publication: HomepagePublicationDto
      expectedRevision: number
      /** True when the server used a different saved revision. */
      revisionMismatch: boolean
    }
  | { status: 'busy'; message: string }
  | {
      status: 'invalid'
      message: string
      errors: HomepageValidationIssue[]
      warnings: HomepageValidationIssue[]
    }
  | { status: 'conflict'; message: string; currentRevision: number | null }
  | { status: 'forbidden'; message: string }
  | { status: 'ambiguous'; message: string }
  | { status: 'error'; message: string }

interface CreatePublicationOptions {
  note?: string | null
  expectedRevision: number
  publishAt?: string | null
}

export function useHomepagePublication() {
  const [current, setCurrent] =
    useState<HomepagePublicationSummaryDto | null>(null)
  const [currentLoading, setCurrentLoading] = useState(true)
  const [currentError, setCurrentError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const currentSeq = useRef(0)
  const initializedRef = useRef(false)
  const publishingRef = useRef(false)

  const refreshCurrent = useCallback(async (): Promise<void> => {
    const seq = ++currentSeq.current
    setCurrentLoading(true)
    setCurrentError(null)
    try {
      const response = await listHomepagePublications({
        status: 'PUBLISHED',
        page: 1,
        limit: 1,
      })
      if (seq === currentSeq.current) {
        setCurrent(response.items[0] ?? null)
      }
    } catch (error) {
      if (seq === currentSeq.current) {
        setCurrentError(merchandisingErrorMessage(error))
      }
    } finally {
      if (seq === currentSeq.current) {
        setCurrentLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (initializedRef.current) {
      return
    }
    initializedRef.current = true
    void refreshCurrent()
  }, [refreshCurrent])

  const create = useCallback(
    async ({
      note,
      expectedRevision,
      publishAt,
    }: CreatePublicationOptions): Promise<HomepagePublishResult> => {
      if (publishingRef.current) {
        return {
          status: 'busy',
          message: 'درخواست انتشار قبلی هنوز در جریان است.',
        }
      }
      publishingRef.current = true
      setPublishing(true)
      try {
        // The backend publishes the current saved draft and has no expected
        // revision field in the payload. Refuse to submit when the server draft
        // moved since the validated revision was loaded. The backend response
        // sourceDraftRevision is compared again afterwards.
        let serverRevision: number
        try {
          const serverDraft = await getHomepageDraft()
          serverRevision = serverDraft.revision
        } catch (error) {
          return {
            status: 'error',
            message: `بررسی نسخه ذخیره‌شده پیش از انتشار ممکن نشد و درخواستی ارسال نشد. ${merchandisingErrorMessage(
              error,
            )}`,
          }
        }
        if (serverRevision !== expectedRevision) {
          return {
            status: 'conflict',
            message:
              'نسخه ذخیره‌شده روی سرور با نسخه اعتبارسنجی‌شده مطابقت ندارد؛ انتشار انجام نشد و تغییرات محلی حفظ شد.',
            currentRevision: serverRevision,
          }
        }

        if (publishAt && Date.parse(publishAt) <= Date.now()) {
          return {
            status: 'error',
            message:
              'زمان انتشار انتخاب‌شده دیگر در آینده نیست؛ دوباره زمان‌بندی کنید.',
          }
        }

        // Immediate publishing deliberately omits publishAt entirely.
        const input = publishAt
          ? { publishAt, note: note?.trim() ? note.trim() : null }
          : { note: note?.trim() ? note.trim() : null }
        const publication = await createHomepagePublication(input)
        await refreshCurrent()
        return {
          status: 'success',
          publication,
          expectedRevision,
          revisionMismatch:
            publication.sourceDraftRevision !== expectedRevision,
        }
      } catch (error) {
        const parsed = parseMerchandisingError(error)
        if (!parsed) {
          return {
            status: 'ambiguous',
            message: publishAt
              ? 'پاسخ سرور دریافت نشد؛ ممکن است زمان‌بندی انجام شده باشد. برای جلوگیری از زمان‌بندی تکراری، درخواست به‌طور خودکار دوباره ارسال نشد. تاریخچه انتشارها را بررسی کنید.'
              : 'پاسخ سرور دریافت نشد؛ ممکن است انتشار انجام شده باشد. برای جلوگیری از انتشار تکراری، درخواست به‌طور خودکار دوباره ارسال نشد. وضعیت نسخه‌های انتشار را بررسی کنید.',
          }
        }
        if (parsed.status === 403) {
          return {
            status: 'forbidden',
            message: publishAt
              ? 'دسترسی زمان‌بندی ندارید. زمان‌بندی انتشار فقط برای نقش مدیر (ADMIN) مجاز است.'
              : 'دسترسی انتشار ندارید. انتشار فوری صفحه اصلی فقط برای نقش مدیر (ADMIN) مجاز است.',
          }
        }
        if (parsed.status === 409) {
          return {
            status: 'conflict',
            message:
              parsed.message ??
              'نسخه پیش‌نویس یا وضعیت انتشار روی سرور تغییر کرده است؛ درخواست انجام نشد و تغییرات محلی حفظ شد.',
            currentRevision: parsed.currentRevision ?? null,
          }
        }
        if (parsed.status === 400) {
          const errors = parseHomepageValidationIssues(parsed.errors)
          const warnings = parseHomepageValidationIssues(parsed.warnings)
          if (errors.length > 0 || warnings.length > 0) {
            return {
              status: 'invalid',
              message:
                errors.length > 0
                  ? 'اعتبارسنجی سرور در زمان انتشار خطا یافت؛ نتیجه در پنل اعتبارسنجی به‌روز شد.'
                  : 'اعتبارسنجی سرور در زمان انتشار هشدار یافت؛ درخواست انتشار تکمیل نشد.',
              errors,
              warnings,
            }
          }
        }
        return {
          status: 'error',
          message: merchandisingErrorMessage(error),
        }
      } finally {
        publishingRef.current = false
        setPublishing(false)
      }
    },
    [refreshCurrent],
  )

  const publish = useCallback(
    (args: { note?: string | null; expectedRevision: number }) =>
      create({ ...args }),
    [create],
  )

  const schedule = useCallback(
    (args: {
      publishAt: string
      note?: string | null
      expectedRevision: number
    }) => create({ ...args }),
    [create],
  )

  return {
    current,
    currentLoading,
    currentError,
    publishing,
    refreshCurrent,
    publish,
    schedule,
  }
}
