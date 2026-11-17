import type { Metadata } from 'next';
import { NotificationsList } from './notifications-list';

export const metadata: Metadata = { title: 'اعلان‌ها' };

/** Server wrapper (SS-243): metadata lives here, interactivity in the island. */
export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-balance text-2xl font-extrabold text-fg">اعلان‌ها</h1>
      <div className="mt-6">
        <NotificationsList />
      </div>
    </div>
  );
}
