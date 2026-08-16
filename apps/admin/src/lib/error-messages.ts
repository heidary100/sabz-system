import { ApiError } from '../services/api'

const BACKEND_TO_PERSIAN: Record<string, string> = {
  'Invalid OTP code.': 'کد تأیید اشتباه است.',
  'OTP has expired. Request a new OTP.': 'کد تأیید منقضی شده است. کد جدید درخواست کنید.',
  'Too many verification attempts. Request a new OTP.':
    'تعداد تلاش‌های ناموفق زیاد است. کد جدید درخواست کنید.',
  'Too many OTP requests. Please try again later.':
    'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
  'Account is not eligible for mobile verification.':
    'این حساب کاربری امکان تأیید شماره ندارد.',
  'Invalid or expired refresh token.': 'نشست شما منقضی شده است. دوباره وارد شوید.',
}

const STATUS_TO_PERSIAN: Record<number, string> = {
  400: 'درخواست نامعتبر است.',
  401: 'دسترسی غیرمجاز. دوباره وارد شوید.',
  403: 'شما مجوز انجام این عملیات را ندارید.',
  404: 'منبع درخواستی پیدا نشد.',
  409: 'وضعیت درخواست تغییر کرده است؛ مجدد تلاش کنید.',
  410: 'کد تأیید منقضی شده است. کد جدید درخواست کنید.',
  422: 'اعتبارسنجی انجام نشد؛ اطلاعات را بررسی کنید.',
  429: 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
}

export function translateApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const message = error.payload?.message
    if (message) {
      if (Array.isArray(message)) {
        const first = message[0]
        if (first) {
          return BACKEND_TO_PERSIAN[first] ?? first
        }
      } else {
        const translated = BACKEND_TO_PERSIAN[message]
        if (translated) {
          return translated
        }
        return message
      }
    }
    const statusMessage = STATUS_TO_PERSIAN[error.status]
    if (statusMessage) {
      return statusMessage
    }
  }
  return 'خطایی رخ داد. دوباره تلاش کنید.'
}
