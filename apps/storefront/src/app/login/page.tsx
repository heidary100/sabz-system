'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ecommerce/ui/button';
import { brand } from '@/lib/brand';
import { ApiError } from '@/lib/api';
import {
  isValidIranianMobile,
  requestOtp,
  toEnglishDigits,
  verifyOtp,
} from '@/lib/auth-client';
import { formatFaNumber } from '@/lib/format';
import { resolveNextTarget } from '@/lib/redirect';

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

/** Two-step customer login (SS-230, split-screen redesign SS-246). */
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

  async function submitCode(override?: string): Promise<void> {
    // Auto-submit passes the just-completed code explicitly — the closure
    // would otherwise read the pre-update state (stale on the same event).
    const normalized = toEnglishDigits(override ?? code).trim();
    if (!/^\d{6}$/.test(normalized)) {
      setError(CODE_ERROR);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await verifyOtp(toEnglishDigits(mobile).trim(), normalized);
      // Honor ?next= (set by authed routes when redirecting logged-out
      // visitors); only safe internal paths survive resolveNextTarget.
      // Read at submit time — window, not useSearchParams, so the client
      // page stays statically prerenderable.
      const next = resolveNextTarget(
        new URLSearchParams(window.location.search).get('next'),
      );
      router.push(next);
    } catch (verifyError) {
      setError(messageOf(verifyError, VERIFY_FAILED));
    } finally {
      setPending(false);
    }
  }

  async function handleCodeSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await submitCode();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-16">
      <div className="grid overflow-hidden rounded-3xl border border-sand-200 bg-white shadow-card lg:grid-cols-2">
        {/* Brand panel (SS-246): the cinematic stage — verified value props
            only, mirroring the home hero's visual language. */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-ink p-10 lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 start-1/4 size-96 rounded-full bg-sabz-600/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 end-8 size-72 rounded-full bg-sabz-500/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-24 bottom-0 size-96 rounded-full border border-white/5"
          />
          <div className="relative flex items-center gap-2 text-white">
            <Image
              src={brand.logoPng[64].src}
              alt=""
              width={40}
              height={40}
              className="rounded-lg"
            />
            <span className="text-lg font-bold">{brand.nameFa}</span>
          </div>
          <div className="relative">
            <h2 className="text-balance text-2xl font-black leading-relaxed text-white">
              فروشگاه کالای دیجیتال
              <span className="text-gradient-sabz"> سبز سیستم</span>
            </h2>
            <ul role="list" className="mt-6 space-y-3.5">
              {['ارسال سریع سفارش‌ها', 'ضمانت بهترین قیمت', 'تضمین اصالت کالا'].map(
                (item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-gray-300">
                    <span className="flex size-5 items-center justify-center rounded-full bg-sabz-700 text-sabz-200">
                      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-3">
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <p className="relative text-xs leading-6 text-gray-500">
            ورود و ثبت‌نام فقط با شماره موبایل و کد پیامکی انجام می‌شود؛
            رمزی برای به‌خاطر سپردن وجود ندارد.
          </p>
        </div>

        {/* Form side: the step swaps replay the entrance animation (SS-246). */}
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <div key={step} className="animate-fade-up">
            <h1 className="text-2xl font-extrabold text-ink-900">ورود به حساب</h1>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {step === 'mobile'
                ? 'شماره موبایل خود را وارد کنید تا کد تأیید پیامک شود.'
                : `کد ۶ رقمی ارسال‌شده به ${toEnglishDigits(mobile).trim()} را وارد کنید.`}
            </p>

            {error !== null && (
              <p
                role="status"
                className="animate-fade-up mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm leading-6 text-red-700 ring-1 ring-inset ring-red-100"
              >
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
                    className="min-h-12 w-full rounded-xl border border-sand-200 bg-sand-50 px-4 text-left text-sm font-medium text-ink-900 shadow-inner transition-shadow placeholder:text-gray-400 focus-visible:border-sabz-400 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-600"
                  />
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={pending}>
                  {pending ? 'در حال ارسال…' : 'ارسال کد تأیید'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleCodeSubmit} className="mt-6 space-y-4">
                <OtpInput
                  value={code}
                  onChange={setCode}
                  onComplete={(completed) => {
                    if (completed && !pending) {
                      void submitCode(completed);
                    }
                  }}
                  disabled={pending}
                />
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

            <p className="mt-6 border-t border-sand-100 pt-4 text-center text-xs leading-5 text-gray-500">
              ورود شما به معنای پذیرش{' '}
              <a href="/terms" className="font-medium text-sabz-700 hover:text-sabz-800">
                شرایط و قوانین
              </a>{' '}
              سبز سیستم است.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Six-box OTP input (SS-246): separate boxes with auto-advance, backspace to
 * the previous box, arrow navigation, and paste distribution. The first box
 * carries `autoComplete="one-time-code"` so SMS OTP autofill still lands,
 * and the whole cluster is exposed as one labelled field via the group's
 * role + the first input's aria-label.
 */
function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Called with the full 6-digit code the moment it completes. */
  onComplete: (completed: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  function commit(nextDigits: Array<string>, focusIndex: number) {
    const next = nextDigits.join('').replace(/ /g, '').slice(0, 6);
    onChange(next);
    const target = Math.min(focusIndex, 5);
    refs.current[target]?.focus();
    if (next.length === 6) {
      onComplete(next);
    }
  }

  function handleChange(index: number, raw: string) {
    const clean = toEnglishDigits(raw).replace(/\D/g, '');
    if (!clean) {
      return;
    }
    const nextDigits = [...digits];
    for (let offset = 0; offset < clean.length && index + offset < 6; offset += 1) {
      nextDigits[index + offset] = clean[offset]!;
    }
    commit(nextDigits, Math.min(index + clean.length, 5));
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const nextDigits = [...digits];
      if (nextDigits[index] !== ' ') {
        nextDigits[index] = ' ';
        commit(nextDigits, index);
      } else if (index > 0) {
        nextDigits[index - 1] = ' ';
        commit(nextDigits, index - 1);
      }
      return;
    }
    if (event.key === 'ArrowRight' && index < 5) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = toEnglishDigits(event.clipboardData.getData('text'))
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!pasted) {
      return;
    }
    const nextDigits = Array.from({ length: 6 }, (_, i) => pasted[i] ?? ' ');
    commit(nextDigits, Math.min(pasted.length, 5));
  }

  return (
    <div
      role="group"
      aria-label="کد تأیید ۶ رقمی"
      dir="ltr"
      className="flex justify-center gap-2"
      onPaste={handlePaste}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={index === 0 ? 6 : 1}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          disabled={disabled}
          value={digit === ' ' ? '' : digit}
          aria-label={`رقم ${formatFaNumber(index + 1)}`}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onFocus={(event) => event.target.select()}
          className="min-h-12 w-11 rounded-xl border border-sand-200 bg-sand-50 text-center text-lg font-bold text-ink-900 shadow-inner transition-all duration-200 focus-visible:border-sabz-400 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sabz-600 disabled:opacity-60 sm:w-12"
        />
      ))}
    </div>
  );
}
