import type { Metadata } from 'next';
import { PartnersPortal } from './partners-portal';

export const metadata: Metadata = { title: 'همکاری با ما' };

/** Server wrapper (SS-230B): metadata lives here, interactivity in the portal. */
export default function PartnersPage() {
  return <PartnersPortal />;
}
