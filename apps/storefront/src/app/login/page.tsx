'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import {
  isValidIranianMobile,
  requestOtp,
  toEnglishDigits,
  verifyOtp,
} from '@/lib/auth-client';
import { formatFaNumber } from '@/lib/format';

/** Resend cooldown after each OTP request (SS-230). */
const RESEND_SECONDS = 120;

const MOBILE_ERROR = 'شماره موبایل معتبر نیست؛ یک شماره ۱۱ رقمی که با ۰۹ شروع می‌شود وارد کنید.';
const CODE_ERROR = 'کد تأیید باید ۶ رقم باشد.';
const SEND_FAILED = 'ارسال کد ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const VERIFY_FAILED = 'تأیید کد ناموفق بود؛ لطفاً دوباره تلاش کنید.';

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.payload?.message ?? fallback;
  }
  return fallback;
}

/** Two-step customer login (SS-230): mobile → 6-digit OTP. */
export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendCode(target: string): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await requestOtp(target);
      setStep('code');
      setCooldown(RESEND_SECONDS);
    } catch (sendError) {
      setError(messageOf(sendError, SEND_FAILED));
    } finally {
      setPending(false);
    }
  }

  async function handleMobileSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const normalized = toEnglishDigits(mobile).trim();
    if (!isValidIranianMobile(normalized)) {
      setError(MOBILE_ERROR);
      return;
    }
    await sendCode(normalized);
  }

  async function handleCodeSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const normalized = toEnglishDigits(code).trim();
    if (!/^\d{6}$/.test(normalized)) {
      setError(CODE_ERROR);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await verifyOtp(toEnglishDigits(mobile).trim(), normalized);
      router.push('/account');
    } catch (verifyError) {
      setError(messageOf(verifyError, VERIFY_FAILED));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <div className="rounded-xl border border-sand-200 bg-white p-6 sm:p-8">
        <h1 className="text-xl font-bold text-ink-900">ورود به حساب</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          {step === 'mobile'
            ? 'شماره موبایل خود را وارد کنید تا کد تأیید پیامک شود.'
            : `کد ۶ رقمی ارسال‌شده به ${toEnglishDigits(mobile).trim()} را وارد کنید.`}
        </p>

        {error !== null && (
          <p role="status" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {step === 'mobile' ? (
          <form onSubmit={handleMobileSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-mobile" className="sr-only">
                موبایل
              </label>
              <input
                id="login-mobile"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                placeholder="09123456789"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                className="min-h-11 w-full rounded-md border border-sand-200 bg-white px-3 text-left text-sm text-ink-900 placeholder:text-gray-400"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? 'در حال ارسال…' : 'ارسال کد تأیید'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleCodeSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-code" className="sr-only">
                کد تأیید
              </label>
              <input
                id="login-code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="------"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="min-h-11 w-full rounded-md border border-sand-200 bg-white px-3 text-center text-sm tracking-[0.5em] text-ink-900 placeholder:text-gray-400"
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? 'در حال بررسی…' : 'ورود'}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={pending || cooldown > 0}
              onClick={() => void sendCode(toEnglishDigits(mobile).trim())}
            >
              {cooldown > 0
                ? `ارسال مجدد کد (${formatFaNumber(cooldown)} ثانیه)`
                : 'ارسال مجدد کد'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
