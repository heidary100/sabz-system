'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
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
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-xl font-bold text-ink-900">حساب کاربری</h1>

      {error !== null && (
        <p role="status" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice !== null && (
        <p role="status" className="rounded-md bg-sabz-50 px-3 py-2 text-sm text-sabz-700">
          {notice}
        </p>
      )}

      <section className="rounded-xl border border-sand-200 bg-white p-6">
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

      <section className="rounded-xl border border-sand-200 bg-white p-6">
        <h2 className="text-sm font-bold text-ink-900">همکاری با ما</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          برای خرید عمده با شرایط همکاری، درخواست خود را ثبت و پیگیری کنید.
        </p>
        <Link
          href="/partners"
          className={`${buttonVariants({ variant: 'outline' })} mt-4`}
        >
          درخواست همکاری
        </Link>
      </section>

      <Button variant="outline" onClick={() => void handleLogout()}>
        خروج از حساب
      </Button>
    </div>
  );
}
