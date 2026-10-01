'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ecommerce/ui/button';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { ApiError } from '@/lib/api';
import {
  fetchProfile,
  hasSession,
  logout,
  updateProfile,
} from '@/lib/auth-client';

const LOAD_FAILED = 'دریافت اطلاعات حساب ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SAVE_FAILED = 'ذخیره اطلاعات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const NAME_TOO_LONG = 'نام و نام خانوادگی نمی‌توانند بیشتر از ۱۰۰ نویسه باشند.';
const ADDRESS_TOO_LONG = 'نشانی نمی‌تواند بیشتر از ۵۰۰ نویسه باشد.';

const inputClassName =
  'min-h-11 w-full rounded-md border border-sand-200 bg-white px-3 text-sm text-ink-900 placeholder:text-gray-400';

/** Customer account panel (SS-230): profile view/edit behind the OTP session. */
export function AccountPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [mobile, setMobile] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    fetchProfile()
      .then((profile) => {
        if (cancelled) {
          return;
        }
        setMobile(profile.mobile);
        setFirstName(profile.firstName ?? '');
        setLastName(profile.lastName ?? '');
        setAddress(profile.address ?? '');
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        if (loadError instanceof ApiError && loadError.status === 401) {
          router.replace('/login');
          return;
        }
        setError(
          loadError instanceof ApiError
            ? (loadError.payload?.message ?? LOAD_FAILED)
            : LOAD_FAILED,
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSave(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const nextFirst = firstName.trim();
    const nextLast = lastName.trim();
    const nextAddress = address.trim();
    if (nextFirst.length > 100 || nextLast.length > 100) {
      setError(NAME_TOO_LONG);
      return;
    }
    if (nextAddress.length > 500) {
      setError(ADDRESS_TOO_LONG);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const profile = await updateProfile({
        firstName: nextFirst,
        lastName: nextLast,
        address: nextAddress,
      });
      setFirstName(profile.firstName ?? '');
      setLastName(profile.lastName ?? '');
      setAddress(profile.address ?? '');
      setNotice('ذخیره شد');
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        router.replace('/login');
        return;
      }
      setError(
        saveError instanceof ApiError
          ? (saveError.payload?.message ?? SAVE_FAILED)
          : SAVE_FAILED,
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace('/');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      {/* Profile header (SS-246): identity moment with the user's initial. */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-ink p-6 text-white sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 start-1/3 size-56 rounded-full bg-sabz-600/25 blur-3xl"
        />
        <div className="relative flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-sabz text-xl font-black shadow-lift">
            {(firstName || lastName || 'ک').trim().charAt(0)}
          </span>
          <div className="min-w-0">
            <h1 className="text-balance text-xl font-extrabold">
              {firstName || lastName
                ? `${firstName} ${lastName}`.trim()
                : 'حساب کاربری'}
            </h1>
            <p dir="ltr" className="mt-1 text-left text-sm text-gray-400">
              {mobile}
            </p>
          </div>
        </div>
      </section>

      {error !== null && (
        <p role="status" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="animate-fade-up rounded-lg bg-sabz-50 px-3 py-2.5 text-sm font-medium text-sabz-700 ring-1 ring-inset ring-sabz-200">
          {notice}
        </p>
      )}

      <section className="rounded-2xl border border-sand-200 bg-white p-6 shadow-card">
        <h2 className="text-sm font-bold text-ink-900">اطلاعات حساب</h2>
        <dl className="mt-4">
          <dt className="text-xs text-gray-500">شماره موبایل</dt>
          <dd dir="ltr" className="mt-1 text-left text-base font-semibold text-ink-900">
            {mobile}
          </dd>
        </dl>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label htmlFor="account-firstName" className="mb-1 block text-sm font-semibold text-ink-900">
              نام
            </label>
            <input
              id="account-firstName"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor="account-lastName" className="mb-1 block text-sm font-semibold text-ink-900">
              نام خانوادگی
            </label>
            <input
              id="account-lastName"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor="account-address" className="mb-1 block text-sm font-semibold text-ink-900">
              نشانی
            </label>
            <textarea
              id="account-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={3}
              className={`${inputClassName} py-2`}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
          </Button>
        </form>
      </section>

      {/* Quick links (SS-246): the member surfaces as scannable tiles. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            href: '/orders',
            title: 'سفارش‌ها',
            body: 'تاریخچه سفارش‌ها، وضعیت ارسال و فاکتورها.',
          },
          {
            href: '/returns',
            title: 'مرجوعی‌ها',
            body: 'ثبت و پیگیری درخواست‌های مرجوعی کالا.',
          },
          {
            href: '/notifications',
            title: 'اعلان‌ها',
            body: 'اعلان‌های سفارش، مرسوله، مرجوعی و استعلام.',
          },
          {
            href: '/rfq',
            title: 'استعلام‌ها',
            body: 'پیگیری استعلام قیمت و پذیرش پیشنهادها.',
          },
          {
            href: '/partners',
            title: 'همکاری با ما',
            body: 'درخواست خرید عمده و شرایط سطح همکاری.',
          },
        ].map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group rounded-2xl border border-sand-200 bg-white p-5 transition-all duration-300 ease-[var(--ease-swift)] hover:-translate-y-1 hover:border-sabz-300 hover:shadow-card"
          >
            <span className="block text-sm font-bold text-ink-900 transition-colors group-hover:text-sabz-700">
              {tile.title}
            </span>
            <span className="mt-1.5 block text-xs leading-5 text-gray-500">
              {tile.body}
            </span>
            <span
              aria-hidden="true"
              className="mt-3 inline-block text-sabz-600 transition-transform duration-300 ease-[var(--ease-swift)] group-hover:-translate-x-1"
            >
              ←
            </span>
          </Link>
        ))}
      </div>

      <div className="flex justify-start border-t border-sand-100 pt-2">
        <Button variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-700" onClick={() => void handleLogout()}>
          خروج از حساب
        </Button>
      </div>
    </div>
  );
}
