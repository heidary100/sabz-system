'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  PartnerApplicationSummary,
  PartnerDocumentType,
} from '@sabz/types';
import { Skeleton } from '@/components/ecommerce/skeleton/skeleton';
import { Button, buttonVariants } from '@/components/ecommerce/ui/button';
import { ApiError } from '@/lib/api';
import { hasSession } from '@/lib/auth-client';
import {
  PARTNER_DOCUMENT_TYPE_LABELS,
  PARTNER_STATUS_LABELS,
  createApplication,
  fetchApplication,
  removeDocument,
  submissionChecklist,
  updateApplication,
  uploadDocument,
} from '@/lib/partners';

type Status = 'checking' | 'login' | 'loading' | 'ready' | 'error';

const LOAD_FAILED = 'دریافت درخواست همکاری ناموفق بود؛ لطفاً دوباره تلاش کنید.';

const inputClassName =
  'min-h-11 w-full rounded-md border border-sand-200 bg-white px-3 text-sm text-ink-900 placeholder:text-gray-400';

const DOCUMENT_TYPES: PartnerDocumentType[] = [
  'BUSINESS_LICENSE',
  'NATIONAL_ID',
  'TAX_REGISTRATION',
  'SUPPORTING',
];

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes.toLocaleString('fa-IR')} بایت`;
  }
  return `${(sizeBytes / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} کیلوبایت`;
}

/**
 * Partner registration portal (SS-230B): tier explainer, business-info form,
 * document uploads, and submit — all over the existing partners endpoints.
 * DRAFT/REJECTED applications are editable; PENDING/APPROVED are locked by
 * the server (409) and render read-only.
 */
export function PartnersPortal() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [app, setApp] = useState<PartnerApplicationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [businessName, setBusinessName] = useState('');
  const [businessLicenseNo, setBusinessLicenseNo] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');

  const [docType, setDocType] = useState<PartnerDocumentType>('BUSINESS_LICENSE');
  const fileRef = useRef<HTMLInputElement>(null);

  const fillForm = useCallback((row: PartnerApplicationSummary) => {
    setBusinessName(row.businessName ?? '');
    setBusinessLicenseNo(row.businessLicenseNo ?? '');
    setNationalId(row.nationalId ?? '');
    setWebsite(row.website ?? '');
    setAddress(row.address ?? '');
    setCity(row.city ?? '');
    setProvince(row.province ?? '');
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    fetchApplication()
      .then((row) => {
        if (cancelled) {
          return;
        }
        setApp(row);
        if (row) {
          fillForm(row);
        }
        setStatus('ready');
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        if (loadError instanceof ApiError && loadError.status === 401) {
          setStatus('login');
          return;
        }
        setError(
          loadError instanceof ApiError
            ? (loadError.payload?.message ?? LOAD_FAILED)
            : LOAD_FAILED,
        );
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [fillForm]);

  useEffect(() => {
    // Session lives in localStorage (client only): the gate below must run
    // post-hydration. Intentional external sync, not derived state.
    if (!hasSession()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('login');
      return;
    }
    return load();
  }, [load]);

  function apiErrorMessage(failure: unknown, fallback: string): string {
    return failure instanceof ApiError
      ? (failure.payload?.message ?? fallback)
      : fallback;
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    setNotice(null);
    const input = {
      businessName: businessName.trim(),
      businessLicenseNo: businessLicenseNo.trim(),
      nationalId: nationalId.trim(),
      website: website.trim(),
      address: address.trim(),
      city: city.trim(),
      province: province.trim(),
    };
    try {
      const row = app
        ? await updateApplication(input)
        : await createApplication(input);
      setApp(row);
      fillForm(row);
      setNotice(app ? 'تغییرات ذخیره شد.' : 'درخواست همکاری ثبت شد.');
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        router.replace('/login');
        return;
      }
      setError(apiErrorMessage(saveError, 'ثبت درخواست همکاری ناموفق بود؛ لطفاً دوباره تلاش کنید.'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      // Persist visible edits together with the submit so nothing is lost.
      const row = await updateApplication({
        businessName: businessName.trim(),
        businessLicenseNo: businessLicenseNo.trim(),
        nationalId: nationalId.trim(),
        website: website.trim(),
        address: address.trim(),
        city: city.trim(),
        province: province.trim(),
        submit: true,
      });
      setApp(row);
      fillForm(row);
      setNotice('درخواست شما برای بررسی ارسال شد.');
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        router.replace('/login');
        return;
      }
      setError(apiErrorMessage(submitError, 'ارسال درخواست همکاری ناموفق بود؛ لطفاً دوباره تلاش کنید.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(): Promise<void> {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('ابتدا یک فایل انتخاب کنید.');
      return;
    }
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      await uploadDocument(docType, file);
      const row = await fetchApplication();
      if (row) {
        setApp(row);
        fillForm(row);
      }
      if (fileRef.current) {
        fileRef.current.value = '';
      }
      setNotice('سند بارگذاری شد.');
    } catch (uploadError) {
      if (uploadError instanceof ApiError && uploadError.status === 401) {
        router.replace('/login');
        return;
      }
      setError(apiErrorMessage(uploadError, 'بارگذاری سند ناموفق بود؛ لطفاً دوباره تلاش کنید.'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveDocument(documentId: string): Promise<void> {
    setError(null);
    try {
      await removeDocument(documentId);
      const row = await fetchApplication();
      if (row) {
        setApp(row);
      }
    } catch (removeError) {
      if (removeError instanceof ApiError && removeError.status === 401) {
        router.replace('/login');
        return;
      }
      setError(apiErrorMessage(removeError, 'حذف سند ناموفق بود؛ لطفاً دوباره تلاش کنید.'));
    }
  }

  if (status === 'checking' || status === 'loading') {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-10 sm:px-6" aria-busy="true" aria-label="در حال بارگذاری صفحه همکاری">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">همکاری با ما</h1>
        <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-ink-900">برای ثبت درخواست همکاری وارد شوید</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">
              درخواست همکاری به حساب کاربری شما متصل است. وارد شوید تا فرم
              ثبت‌نام همکاران را ببینید.
            </p>
            <Link href="/login" className={`${buttonVariants({ variant: 'primary' })} mt-8`}>
              ورود / ثبت‌نام
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">همکاری با ما</h1>
        <div className="mt-8 rounded-2xl border border-sand-200 bg-white">
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-ink-900">خطا در بارگذاری صفحه همکاری</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-600">{error ?? LOAD_FAILED}</p>
            <Button variant="primary" className="mt-8" onClick={load}>
              تلاش مجدد
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const editable = app === null || app.approvalStatus === 'DRAFT' || app.approvalStatus === 'REJECTED';
  const checklist = app ? submissionChecklist(app) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink-900">همکاری با ما</h1>

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

      <section aria-labelledby="tiers-heading" className="rounded-xl border border-sand-200 bg-white p-6">
        <h2 id="tiers-heading" className="text-sm font-bold text-ink-900">
          فروش عمده با شرایط همکاری
        </h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          حساب همکار برای خرید عمده با شرایط ویژه در نظر گرفته شده است. سطح
          همکاری شما بر اساس حجم خرید تعیین میشود و جزئیات آن پس از تأیید
          درخواست، در همین صفحه نمایش داده میشود.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { step: '۱', title: 'ثبت درخواست', text: 'فرم زیر را تکمیل و سند جواز کسب را بارگذاری کنید.' },
            { step: '۲', title: 'بررسی کارشناسان', text: 'درخواست شما بررسی و نتیجه اعلام میشود.' },
            { step: '۳', title: 'فعال‌سازی حساب همکار', text: 'پس از تأیید، سطح همکاری شما مشخص میشود.' },
          ].map((item) => (
            <li key={item.step} className="rounded-lg bg-sabz-50 p-4">
              <p className="text-sm font-bold text-sabz-800">
                <span aria-hidden="true">{item.step}. </span>
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{item.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {app !== null && (
        <section aria-labelledby="status-heading" className="rounded-xl border border-sand-200 bg-white p-6">
          <h2 id="status-heading" className="text-sm font-bold text-ink-900">
            وضعیت درخواست
          </h2>
          <p className="mt-3 text-base font-semibold text-sabz-800">
            {PARTNER_STATUS_LABELS[app.approvalStatus]}
          </p>
          {app.approvalStatus === 'PENDING' && (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              درخواست شما در حال بررسی است و فعلاً قابل ویرایش نیست.
            </p>
          )}
          {app.approvalStatus === 'APPROVED' && app.tier !== null && (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              سطح همکاری: {app.tier.name}
            </p>
          )}
          {app.approvalStatus === 'REJECTED' && app.rejectionReason && (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              دلیل رد درخواست: {app.rejectionReason}
            </p>
          )}
          {app.approvalStatus === 'REJECTED' && (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              میتوانید اطلاعات را ویرایش و درخواست را دوباره ارسال کنید.
            </p>
          )}
        </section>
      )}

      {editable && (
        <section aria-labelledby="form-heading" className="rounded-xl border border-sand-200 bg-white p-6">
          <h2 id="form-heading" className="text-sm font-bold text-ink-900">
            {app ? 'ویرایش اطلاعات کسب‌وکار' : 'ثبت درخواست همکاری'}
          </h2>
          {app === null && (
            <p className="mt-2 text-sm leading-6 text-gray-600">
              برای ثبت درخواست، ابتدا پروفایل کاربری (نام و نام خانوادگی) را در{' '}
              <Link href="/account" className="font-semibold text-sabz-700 hover:text-sabz-800">
                حساب کاربری
              </Link>{' '}
              تکمیل کنید.
            </p>
          )}
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="partner-businessName" className="mb-1 block text-sm font-semibold text-ink-900">
                نام کسب‌وکار *
              </label>
              <input
                id="partner-businessName"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                maxLength={200}
                className={inputClassName}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="partner-licenseNo" className="mb-1 block text-sm font-semibold text-ink-900">
                  شماره جواز
                </label>
                <input
                  id="partner-licenseNo"
                  value={businessLicenseNo}
                  onChange={(event) => setBusinessLicenseNo(event.target.value)}
                  maxLength={100}
                  className={inputClassName}
                />
              </div>
              <div>
                <label htmlFor="partner-nationalId" className="mb-1 block text-sm font-semibold text-ink-900">
                  شناسه ملی
                </label>
                <input
                  id="partner-nationalId"
                  value={nationalId}
                  onChange={(event) => setNationalId(event.target.value)}
                  maxLength={100}
                  className={inputClassName}
                />
              </div>
            </div>
            <div>
              <label htmlFor="partner-website" className="mb-1 block text-sm font-semibold text-ink-900">
                وب‌سایت
              </label>
              <input
                id="partner-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                maxLength={200}
                dir="ltr"
                className={`${inputClassName} text-left`}
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label htmlFor="partner-address" className="mb-1 block text-sm font-semibold text-ink-900">
                نشانی کسب‌وکار
              </label>
              <textarea
                id="partner-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={3}
                maxLength={500}
                className={`${inputClassName} py-2`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="partner-city" className="mb-1 block text-sm font-semibold text-ink-900">
                  شهر
                </label>
                <input
                  id="partner-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  maxLength={100}
                  className={inputClassName}
                />
              </div>
              <div>
                <label htmlFor="partner-province" className="mb-1 block text-sm font-semibold text-ink-900">
                  استان
                </label>
                <input
                  id="partner-province"
                  value={province}
                  onChange={(event) => setProvince(event.target.value)}
                  maxLength={100}
                  className={inputClassName}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" disabled={saving || submitting} onClick={() => void handleSave()}>
                {saving ? 'در حال ذخیره…' : app ? 'ذخیره تغییرات' : 'ثبت درخواست'}
              </Button>
              {app !== null && (
                <Button variant="dark" disabled={saving || submitting} onClick={() => void handleSubmit()}>
                  {submitting ? 'در حال ارسال…' : 'ارسال درخواست برای بررسی'}
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {app !== null && (
        <section aria-labelledby="docs-heading" className="rounded-xl border border-sand-200 bg-white p-6">
          <h2 id="docs-heading" className="text-sm font-bold text-ink-900">
            مدارک کسب‌وکار
          </h2>
          {editable && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="partner-docType" className="mb-1 block text-sm font-semibold text-ink-900">
                    نوع سند
                  </label>
                  <select
                    id="partner-docType"
                    value={docType}
                    onChange={(event) => setDocType(event.target.value as PartnerDocumentType)}
                    className={inputClassName}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {PARTNER_DOCUMENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="partner-docFile" className="mb-1 block text-sm font-semibold text-ink-900">
                    فایل (حداکثر ۱۰ مگابایت: PDF، PNG، JPG)
                  </label>
                  <input
                    id="partner-docFile"
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="min-h-11 w-full text-sm text-ink-900 file:me-3 file:min-h-11 file:rounded-md file:border-0 file:bg-sabz-700 file:px-5 file:text-sm file:font-semibold file:text-white hover:file:bg-sabz-800"
                  />
                </div>
              </div>
              <Button variant="outline" disabled={uploading} onClick={() => void handleUpload()}>
                {uploading ? 'در حال بارگذاری…' : 'بارگذاری سند'}
              </Button>
            </div>
          )}
          <ul className="mt-4 space-y-2">
            {app.documents.length === 0 && (
              <li className="text-sm text-gray-500">هنوز سندی بارگذاری نشده است.</li>
            )}
            {app.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-sand-200 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{doc.originalName}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {PARTNER_DOCUMENT_TYPE_LABELS[doc.type]} · {formatBytes(doc.sizeBytes)}
                  </p>
                </div>
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleRemoveDocument(doc.id)}
                  >
                    حذف
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <ul aria-label="موارد لازم برای ارسال" className="mt-4 space-y-1 border-t border-sand-200 pt-4">
              {checklist.map((item) => (
                <li key={item.field} className="flex items-center gap-2 text-sm">
                  <span aria-hidden="true" className={item.done ? 'text-sabz-700' : 'text-gray-300'}>
                    {item.done ? '✓' : '○'}
                  </span>
                  <span className={item.done ? 'text-gray-600' : 'font-semibold text-ink-900'}>
                    {item.label}
                    <span className="sr-only">{item.done ? ' (تکمیل شده)' : ' (باقی‌مانده)'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
