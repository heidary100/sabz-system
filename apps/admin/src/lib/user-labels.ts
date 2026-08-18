import type { AppRole, UserStatus } from '@sabz/types'

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  PENDING_OTP: 'در انتظار تأیید',
  ACTIVE: 'فعال',
  SUSPENDED: 'تعلیق‌شده',
  LOCKED: 'قفل‌شده',
}

export const USER_STATUS_ORDER: UserStatus[] = [
  'PENDING_OTP',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
]

export const ROLE_LABELS: Record<AppRole, string> = {
  CUSTOMER: 'مشتری',
  PARTNER: 'همکار',
  OPERATOR: 'اپراتور',
  ADMIN: 'مدیر',
}

export const ROLE_ORDER: AppRole[] = ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN']
