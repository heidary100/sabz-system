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
import { NationalIdField } from './national-id-field';

const LOAD_FAILED = 'دریافت اطلاعات حساب ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const SAVE_FAILED = 'ذخیره اطلاعات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
const NAME_TOO_LONG = 'نام و نام خانوادگی نمی‌توانند بیشتر از ۱۰۰ نویسه باشند.';
const ADDRESS_TOO_LONG = 'نشانی نمی‌تواند بیشتر از ۵۰۰ نویسه باشد.';

const inputClassName =
  'min-h-11 w-full rounded-control border border-border-control bg-surface px-3 text-sm text-fg placeholder:text-fg-muted';

/** Customer account panel (SS-230): profile view/edit behind the OTP session. */
export function AccountPanel() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [mobile, setMobile] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address, setAddress] = useState('');
  const [hasNationalId, setHasNationalId] = useState(false);
  const [maskedNationalId, setMaskedNationalId] = useState<string | null>(
    null,
  );
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
        setHasNationalId(profile.hasNationalId === true);
        setMaskedNationalId(profile.maskedNationalId ?? null);
        setProfileLoaded(true);
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
      setHasNationalId(profile.hasNationalId === true);
      setMaskedNationalId(profile.maskedNationalId ?? null);
      setProfileLoaded(true);
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

  async function handleSaveNationalId(
    nationalId: string,
  ): Promise<{ hasNationalId: boolean; maskedNationalId: string | null }> {
    const profile = await updateProfile({ nationalId });
    const next = {
      hasNationalId: profile.hasNationalId === true,
      maskedNationalId: profile.maskedNationalId ?? null,
    };
    setHasNationalId(next.hasNationalId);
    setMaskedNationalId(next.maskedNationalId);
    return next;
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
      <section className="relative overflow-hidden rounded-panel bg-stage p-6 text-on-stage sm:p-8">
        <div className="relative flex items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-panel bg-accent text-xl font-black text-on-accent shadow-lift">
            {(firstName || lastName || 'ک').trim().charAt(0)}
          </span>
          <div className="min-w-0">
            <h1 className="text-balance text-xl font-extrabold">
              {firstName || lastName
                ? `${firstName} ${lastName}`.trim()
                : 'حساب کاربری'}
            </h1>
            <p dir="ltr" className="mt-1 text-left text-sm text-on-stage-muted">
              {mobile}
            </p>
          </div>
        </div>
      </section>

      {error !== null && (
        <p role="status" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger ring-1 ring-inset ring-danger/20">
          {error}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="animate-fade-up rounded-control bg-accent-soft px-3 py-2.5 text-sm font-medium text-accent ring-1 ring-inset ring-accent/20">
          {notice}
        </p>
      )}

      <section className="rounded-panel border border-border bg-surface p-6 shadow-card">
        <h2 className="text-sm font-bold text-fg">اطلاعات حساب</h2>
        <dl className="mt-4">
          <dt className="text-xs text-fg-muted">شماره موبایل</dt>
          <dd dir="ltr" className="mt-1 text-left text-base font-semibold text-fg">
            {mobile}
          </dd>
        </dl>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <label htmlFor="account-firstName" className="mb-1 block text-sm font-semibold text-fg">
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
            <label htmlFor="account-lastName" className="mb-1 block text-sm font-semibold text-fg">
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
            <label htmlFor="account-address" className="mb-1 block text-sm font-semibold text-fg">
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

      {profileLoaded && (
        <NationalIdField
          hasNationalId={hasNationalId}
          maskedNationalId={maskedNationalId}
          onSave={handleSaveNationalId}
          onUnauthorized={() => router.replace('/login')}
        />
      )}

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
            className="group rounded-panel border border-border bg-surface p-5 transition-all duration-300 ease-[var(--ease-swift)] hover:-translate-y-1 hover:border-accent hover:shadow-card"
          >
            <span className="block text-sm font-bold text-fg transition-colors group-hover:text-accent">
              {tile.title}
            </span>
            <span className="mt-1.5 block text-xs leading-5 text-fg-muted">
              {tile.body}
            </span>
            <span
              aria-hidden="true"
              className="mt-3 inline-block text-accent transition-transform duration-300 ease-[var(--ease-swift)] group-hover:-translate-x-1"
            >
              ←
            </span>
          </Link>
        ))}
      </div>

      <div className="flex justify-start border-t border-border pt-2">
        <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => void handleLogout()}>
          خروج از حساب
        </Button>
      </div>
    </div>
  );
}
