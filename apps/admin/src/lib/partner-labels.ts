import type { PartnerDocumentType, PartnerStatus } from '@sabz/types'

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأیید شده',
  REJECTED: 'رد شده',
}

export const PARTNER_STATUS_ORDER: PartnerStatus[] = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
]

export const PARTNER_DOCUMENT_TYPE_LABELS: Record<PartnerDocumentType, string> = {
  BUSINESS_LICENSE: 'جواز کسب',
  NATIONAL_ID: 'کد ملی',
  TAX_REGISTRATION: 'ثبت مالیاتی',
  SUPPORTING: 'اسناد تکمیلی',
}