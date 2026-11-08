// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

const authClient = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  updateProfile: vi.fn(),
  hasSession: vi.fn(() => true),
  logout: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => authClient);

import { AccountPanel } from './account-panel';

const PROFILE = {
  id: 'user-1',
  mobile: '+989123456789',
  firstName: 'علی',
  lastName: 'احمدی',
  address: 'تهران',
  hasNationalId: true,
  maskedNationalId: '****6746',
};

describe('AccountPanel national ID integration (SS-260)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders only the masked saved value and keeps it out of the main profile payload', async () => {
    authClient.fetchProfile.mockResolvedValue(PROFILE);
    authClient.updateProfile.mockResolvedValue(PROFILE);

    render(<AccountPanel />);

    expect(await screen.findByText('****6746')).toBeTruthy();
    expect(screen.queryByDisplayValue('6059926746')).toBeNull();
    expect(screen.queryByText('6059926746')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    await waitFor(() =>
      expect(authClient.updateProfile).toHaveBeenCalledWith({
        firstName: 'علی',
        lastName: 'احمدی',
        address: 'تهران',
      }),
    );
    const payload = authClient.updateProfile.mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty('nationalId');
  });

  it('hides the national ID field until the profile load succeeds', async () => {
    authClient.fetchProfile.mockRejectedValue(new Error('network down'));

    render(<AccountPanel />);

    expect(
      await screen.findByText(
        'دریافت اطلاعات حساب ناموفق بود؛ لطفاً دوباره تلاش کنید.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('اطلاعات هویتی')).toBeNull();
  });

  it('shows the correct saved state when a later profile save succeeds after a load failure', async () => {
    authClient.fetchProfile.mockRejectedValue(new Error('network down'));
    authClient.updateProfile.mockResolvedValue(PROFILE);

    render(<AccountPanel />);
    await screen.findByText(
      'دریافت اطلاعات حساب ناموفق بود؛ لطفاً دوباره تلاش کنید.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'ذخیره تغییرات' }));

    expect(await screen.findByText('****6746')).toBeTruthy();
    expect(screen.queryByDisplayValue('6059926746')).toBeNull();
  });
});
