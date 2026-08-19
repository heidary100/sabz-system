const AUDIT_ACTION_LABELS: Record<string, string> = {
  ACCOUNT_ACTIVATED: 'فعال‌سازی حساب',
  OTP_REQUESTED: 'درخواست کد تأیید',
  OTP_VERIFIED: 'تأیید کد',
  OTP_FAILED: 'خطا در تأیید کد',
  PROFILE_UPDATE: 'به‌روزرسانی پروفایل',
  SESSION_CREATED: 'ایجاد نشست',
  SESSION_REFRESHED: 'تمدید نشست',
  SESSION_REVOKED: 'لغو نشست',
  AUTHENTICATION_FAILED: 'خطای احراز هویت',
  PARTNER_APPLICATION_CREATED: 'ایجاد درخواست همکاری',
  PARTNER_APPLICATION_UPDATED: 'به‌روزرسانی درخواست همکاری',
  PARTNER_APPLICATION_SUBMITTED: 'ارسال درخواست همکاری',
  PARTNER_DOCUMENT_UPLOADED: 'بارگذاری سند',
  PARTNER_DOCUMENT_REMOVED: 'حذف سند',
  PARTNER_APPROVED: 'تأیید همکار',
  PARTNER_REJECTED: 'رد همکار',
  PARTNER_TIER_CHANGED: 'تغییر سطح همکار',
  USER_SUSPENDED: 'تعلیق کاربر',
  USER_UNSUSPENDED: 'رفع تعلیق کاربر',
  USER_UNLOCKED: 'بازکردن قفل کاربر',
  ROLE_ASSIGNED: 'اختصاص نقش',
  ROLE_REMOVED: 'حذف نقش',
}

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  User: 'کاربر',
  UserProfile: 'پروفایل کاربر',
  UserSession: 'نشست کاربر',
  UserRole: 'نقش کاربر',
  Partner: 'همکار',
  BusinessDocument: 'سند کسب‌وکار',
}

export const AUDIT_ACTION_ORDER: string[] = Object.keys(AUDIT_ACTION_LABELS)
export const AUDIT_ENTITY_ORDER: string[] = Object.keys(AUDIT_ENTITY_LABELS)

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABELS[entity] ?? entity
}
