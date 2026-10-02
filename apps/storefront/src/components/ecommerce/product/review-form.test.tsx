// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { ReviewForm } from './review-form';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));

// jsdom has no real server/client split, so the session snapshot is scripted:
// `false` for the server pass, `true` for the hydration pass — exactly the
// signed-in-visitor shape that produced the #291 mismatch.
const session = vi.hoisted(() => ({ hasSession: (): boolean => false }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@/lib/auth-client', () => ({
  hasSession: () => session.hasSession(),
}));

vi.mock('next/link', () => ({
  default: function FakeLink({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

beforeEach(() => {
  session.hasSession = () => false;
  router.push.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('ReviewForm session rendering (#291)', () => {
  it('shows the signed-out card with the login link for guests', () => {
    render(<ReviewForm productId="p1" productSlug="some-slug" />);
    expect(screen.getByText('دیدگاه شما')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ورود به حساب' }).getAttribute('href')).toBe(
      '/login?next=/products/some-slug',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('hydrates a signed-in session without a text mismatch', async () => {
    // Regression pin for #291: ReviewForm used to read the session in a
    // useState initializer, so the server pass emitted the signed-out card
    // while the hydration pass rendered the form — a text mismatch recovered
    // by the route error boundary.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = renderToString(
      <ReviewForm productId="p1" productSlug="some-slug" />,
    );
    // Server HTML must be the signed-out card (SSR has no session).
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('وارد حساب خود شوید');

    session.hasSession = () => true;

    const hydrationErrors: string[] = [];
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((...args: unknown[]) => {
        hydrationErrors.push(args.map(String).join(' '));
      });

    try {
      await act(async () => {
        hydrateRoot(container, <ReviewForm productId="p1" productSlug="some-slug" />, {
          // Recoverable hydration errors surface here (and as console.error).
          onRecoverableError: (error) => hydrationErrors.push(String(error)),
        });
      });
      // After the post-hydration session flip the form is live…
      await act(async () => {});
      expect(container.querySelector('textarea')).not.toBeNull();
      // …and hydration itself reported no text mismatch.
      const mismatch = hydrationErrors.filter((line) => /hydrat/i.test(line));
      expect(mismatch).toEqual([]);
    } finally {
      errorSpy.mockRestore();
      container.remove();
    }
  });
});
