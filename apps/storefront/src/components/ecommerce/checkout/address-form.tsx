'use client';

import { useState } from 'react';
import type { AddressDto, CreateAddressInput } from '@sabz/types';
import { Button } from '@/components/ecommerce/ui/button';
import { createAddress } from '@/lib/addresses';
import { ApiError } from '@/lib/api';

const SAVE_FAILED = 'ذخیره نشانی ناموفق بود؛ لطفاً دوباره تلاش کنید.';

const inputClassName =
  'min-h-11 w-full rounded-md border border-sand-200 bg-white px-3 text-sm text-ink-900 placeholder:text-gray-400';

/**
 * New-address form (SS-233): controlled fields over `POST /addresses`;
 * server validation messages surface verbatim (Persian). Reports the
 * created row so the picker can select it immediately.
 */
export function AddressForm({ onCreated }: { onCreated: (row: AddressDto) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const input: CreateAddressInput = {
      ...(label.trim() !== '' ? { label: label.trim() } : {}),
      fullName: fullName.trim(),
      phone: phone.trim(),
      ...(province.trim() !== '' ? { province: province.trim() } : {}),
      ...(city.trim() !== '' ? { city: city.trim() } : {}),
      address: address.trim(),
      ...(postalCode.trim() !== '' ? { postalCode: postalCode.trim() } : {}),
    };
    try {
      const row = await createAddress(input);
      onCreated(row);
      setOpen(false);
      setLabel('');
      setFullName('');
      setPhone('');
      setProvince('');
      setCity('');
      setAddress('');
      setPostalCode('');
    } catch (submitError) {
      setError(
        submitError instanceof ApiError
          ? (submitError.payload?.message ?? SAVE_FAILED)
          : SAVE_FAILED,
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        افزودن نشانی جدید
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-4 rounded-xl border border-sand-200 bg-sand-50 p-4"
    >
      <h3 className="text-sm font-bold text-ink-900">نشانی جدید</h3>
      {error !== null ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="checkout-fullName" className="mb-1 block text-sm font-semibold text-ink-900">
            نام و نام خانوادگی تحویل‌گیرنده *
          </label>
          <input
            id="checkout-fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className={inputClassName}
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="checkout-phone" className="mb-1 block text-sm font-semibold text-ink-900">
            موبایل *
          </label>
          <input
            id="checkout-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className={inputClassName}
            inputMode="tel"
            dir="ltr"
            placeholder="09123456789"
          />
        </div>
        <div>
          <label htmlFor="checkout-province" className="mb-1 block text-sm font-semibold text-ink-900">
            استان
          </label>
          <input
            id="checkout-province"
            value={province}
            onChange={(event) => setProvince(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor="checkout-city" className="mb-1 block text-sm font-semibold text-ink-900">
            شهر
          </label>
          <input
            id="checkout-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={inputClassName}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="checkout-address" className="mb-1 block text-sm font-semibold text-ink-900">
            نشانی *
          </label>
          <textarea
            id="checkout-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={3}
            className={`${inputClassName} py-2`}
          />
        </div>
        <div>
          <label htmlFor="checkout-postalCode" className="mb-1 block text-sm font-semibold text-ink-900">
            کد پستی
          </label>
          <input
            id="checkout-postalCode"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
            className={inputClassName}
            inputMode="numeric"
            dir="ltr"
            placeholder="۱۰ رقم"
          />
        </div>
        <div>
          <label htmlFor="checkout-label" className="mb-1 block text-sm font-semibold text-ink-900">
            برچسب (مثلاً خانه)
          </label>
          <input
            id="checkout-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={inputClassName}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'در حال ذخیره…' : 'ذخیره نشانی'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          انصراف
        </Button>
      </div>
    </form>
  );
}
