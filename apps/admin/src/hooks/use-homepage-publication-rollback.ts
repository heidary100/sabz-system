import { useCallback, useRef, useState } from 'react'
import type {
  HomepagePublicationDto,
  HomepageValidationIssue,
} from '@sabz/types'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../lib/merchandising-errors'
import { parseHomepageValidationIssues } from '../lib/merchandising-publication'
import { rollbackHomepagePublication } from '../services/merchandising'

export type HomepageRollbackResult =
  | { status: 'success'; publication: HomepagePublicationDto }
  | { status: 'busy'; message: string }
  | {
      status: 'conflict'
      message: string
      errorCode: string | null
      currentStatus: string | null
      currentPublicationId: string | null
      errors: HomepageValidationIssue[]
      warnings: HomepageValidationIssue[]
    }
  | { status: 'forbidden'; message: string }
  | { status: 'not-found'; message: string }
  | { status: 'ambiguous'; message: string }
  | { status: 'error'; message: string }

export function useHomepagePublicationRollback() {
  const [rollingBack, setRollingBack] = useState(false)
  const rollingBackRef = useRef(false)

  const rollback = useCallback(
    async (
      publicationId: string,
      note?: string | null,
    ): Promise<HomepageRollbackResult> => {
      if (rollingBackRef.current) {
        return {
          status: 'busy',
          message: 'درخواست بازگردانی قبلی هنوز در جریان است.',
        }
      }
      rollingBackRef.current = true
      setRollingBack(true)
      try {
        const publication = await rollbackHomepagePublication(publicationId, {
          note: note?.trim() ? note.trim() : null,
        })
        return { status: 'success', publication }
      } catch (error) {
        const parsed = parseMerchandisingError(error)
        if (!parsed) {
          return {
            status: 'ambiguous',
            message:
              'پاسخ سرور دریافت نشد؛ ممکن است بازگردانی انجام شده باشد. برای جلوگیری از درخواست تکراری، عملیات به‌طور خودکار تکرار نشد. تاریخچه انتشارها را دوباره بررسی کنید.',
          }
        }
        if (parsed.status === 403) {
          return {
            status: 'forbidden',
            message:
              'دسترسی بازگردانی ندارید. بازگردانی نسخه صفحه اصلی فقط برای نقش مدیر (ADMIN) مجاز است.',
          }
        }
        if (parsed.status === 404) {
          return {
            status: 'not-found',
            message:
              'نسخه مبدأ بازگردانی یافت نشد؛ ممکن است شناسه نامعتبر یا داده سرور تغییر کرده باشد.',
          }
        }
        if (parsed.status === 409) {
          return {
            status: 'conflict',
            message:
              parsed.message ??
              'این نسخه برای بازگردانی معتبر نیست یا وضعیت انتشار تغییر کرده است.',
            errorCode: parsed.errorCode,
            currentStatus:
              typeof parsed.payload.currentStatus === 'string'
                ? parsed.payload.currentStatus
                : null,
            currentPublicationId:
              typeof parsed.payload.currentPublicationId === 'string'
                ? parsed.payload.currentPublicationId
                : null,
            errors: parseHomepageValidationIssues(parsed.errors),
            warnings: parseHomepageValidationIssues(parsed.warnings),
          }
        }
        return { status: 'error', message: merchandisingErrorMessage(error) }
      } finally {
        rollingBackRef.current = false
        setRollingBack(false)
      }
    },
    [],
  )

  return { rollingBack, rollback }
}
