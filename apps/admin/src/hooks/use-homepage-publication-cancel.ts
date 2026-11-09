import { useCallback, useRef, useState } from 'react'
import type { HomepagePublicationDto } from '@sabz/types'
import {
  merchandisingErrorMessage,
  parseMerchandisingError,
} from '../lib/merchandising-errors'
import { cancelHomepagePublication } from '../services/merchandising'

export type HomepageCancelResult =
  | { status: 'success'; publication: HomepagePublicationDto }
  | { status: 'busy'; message: string }
  | { status: 'conflict'; message: string; currentStatus: string | null }
  | { status: 'forbidden'; message: string }
  | { status: 'not-found'; message: string }
  | { status: 'ambiguous'; message: string }
  | { status: 'error'; message: string }

export function useHomepagePublicationCancel() {
  const [cancelling, setCancelling] = useState(false)
  const cancellingRef = useRef(false)

  const cancel = useCallback(
    async (publicationId: string): Promise<HomepageCancelResult> => {
      if (cancellingRef.current) {
        return {
          status: 'busy',
          message: 'درخواست لغو قبلی هنوز در جریان است.',
        }
      }
      cancellingRef.current = true
      setCancelling(true)
      try {
        const publication = await cancelHomepagePublication(publicationId)
        return { status: 'success', publication }
      } catch (error) {
        const parsed = parseMerchandisingError(error)
        if (!parsed) {
          return {
            status: 'ambiguous',
            message:
              'پاسخ سرور دریافت نشد؛ ممکن است لغو انجام شده باشد. برای جلوگیری از درخواست تکراری، عملیات به‌طور خودکار تکرار نشد. وضعیت انتشار را دوباره بررسی کنید.',
          }
        }
        if (parsed.status === 403) {
          return {
            status: 'forbidden',
            message:
              'دسترسی لغو انتشار ندارید. لغو انتشار زمان‌بندی‌شده فقط برای نقش مدیر (ADMIN) مجاز است.',
          }
        }
        if (parsed.status === 404) {
          return {
            status: 'not-found',
            message: 'نسخه انتشار یافت نشد؛ ممکن است حذف یا شناسه نامعتبر باشد.',
          }
        }
        if (parsed.status === 409) {
          return {
            status: 'conflict',
            message:
              parsed.message ??
              'وضعیت این انتشار تغییر کرده و دیگر قابل لغو نیست. داده‌های تازه را بررسی کنید.',
            currentStatus:
              typeof parsed.payload.currentStatus === 'string'
                ? parsed.payload.currentStatus
                : null,
          }
        }
        return { status: 'error', message: merchandisingErrorMessage(error) }
      } finally {
        cancellingRef.current = false
        setCancelling(false)
      }
    },
    [],
  )

  return { cancelling, cancel }
}
