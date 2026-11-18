'use client';

import { useStoreNotifications } from '@/components/ecommerce/notifications/notification-provider';
import { buttonVariants } from '@/components/ecommerce/ui/button';

/** Sound/browser-push preferences on the customer notification center. */
export function StoreNotificationSettings() {
  const {
    preferences,
    pushConfig,
    pushBusy,
    error,
    setSoundEnabled,
    setBrowserPushEnabled,
    playTestSound,
  } = useStoreNotifications();

  return (
    <section id="settings" className="mt-8 rounded-panel border border-border bg-surface p-5">
      <h2 className="text-base font-bold text-fg">تنظیمات اعلان</h2>
      <p className="mt-1 text-sm leading-6 text-fg-secondary">
        اعلان‌های درون‌برنامه‌ای همیشه فعال‌اند. صدا و اعلان مرورگری اختیاری است.
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-fg">صدای اعلان</span>
          <input
            type="checkbox"
            checked={preferences.soundEnabled}
            onChange={(event) => void setSoundEnabled(event.target.checked)}
            className="size-5 accent-accent"
          />
        </label>
        <button
          type="button"
          onClick={playTestSound}
          disabled={!preferences.soundEnabled}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          آزمایش صدا
        </button>
        <label className="flex items-start justify-between gap-3 border-t border-border pt-4">
          <span className="min-w-0">
            <span className="block text-sm text-fg">اعلان مرورگری</span>
            <span className="mt-0.5 block text-xs leading-5 text-fg-muted">
              {pushConfig?.enabled
                ? 'دریافت اعلان حتی وقتی صفحه بسته است.'
                : 'در این سرور پیکربندی نشده است.'}
            </span>
          </span>
          <input
            type="checkbox"
            checked={preferences.browserPushEnabled}
            disabled={pushBusy || !pushConfig?.enabled}
            onChange={(event) => void setBrowserPushEnabled(event.target.checked)}
            className="mt-1 size-5 accent-accent disabled:opacity-40"
          />
        </label>
      </div>
    </section>
  );
}
