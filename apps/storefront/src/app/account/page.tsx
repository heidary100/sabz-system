import type { Metadata } from 'next';
import { AccountPanel } from './account-panel';

export const metadata: Metadata = { title: 'حساب کاربری' };

/** Server wrapper (SS-230): metadata lives here, interactivity in the panel. */
export default function AccountPage() {
  return <AccountPanel />;
}
