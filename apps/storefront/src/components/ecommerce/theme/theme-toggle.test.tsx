// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let systemDark = false;
let mediaListeners: Array<() => void> = [];

function installMatchMedia(): void {
  mediaListeners = [];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('dark') ? systemDark : false,
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: () => void) => {
        mediaListeners.push(listener);
      },
      removeEventListener: (_event: string, listener: () => void) => {
        mediaListeners = mediaListeners.filter((item) => item !== listener);
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    })),
  );
}

function changeSystemPreference(next: boolean): void {
  systemDark = next;
  for (const listener of mediaListeners) {
    listener();
  }
}

async function renderToggle() {
  vi.resetModules();
  const [{ ThemeProvider }, { ThemeToggle }] = await Promise.all([
    import('./theme-provider'),
    import('./theme-toggle'),
  ]);
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
  return screen.getByRole('button', { name: /پوسته:/ });
}

beforeEach(() => {
  systemDark = false;
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  installMatchMedia();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ThemeToggle', () => {
  it('follows the system preference on first visit', async () => {
    const trigger = await renderToggle();
    await waitFor(() =>
      expect(trigger.getAttribute('aria-label')).toBe('پوسته: هماهنگ با سیستم'),
    );
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('persists an explicit dark selection and applies it', async () => {
    const trigger = await renderToggle();
    fireEvent.click(trigger);
    const dark = await screen.findByRole('menuitemradio', { name: 'تیره' });
    fireEvent.click(dark);

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    );
    expect(window.localStorage.getItem('sabz-theme')).toBe('dark');
    expect(trigger.getAttribute('aria-label')).toBe('پوسته: تیره');
  });

  it('retains an explicit light selection across a remount', async () => {
    window.localStorage.setItem('sabz-theme', 'light');
    const trigger = await renderToggle();
    await waitFor(() =>
      expect(trigger.getAttribute('aria-label')).toBe('پوسته: روشن'),
    );
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('updates in system mode when the OS preference changes', async () => {
    await renderToggle();
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('light'),
    );

    act(() => changeSystemPreference(true));

    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('dark'),
    );
  });

  it('keeps an explicit selection when the OS preference changes', async () => {
    window.localStorage.setItem('sabz-theme', 'light');
    await renderToggle();
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe('light'),
    );

    act(() => changeSystemPreference(true));

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back safely when the stored preference is invalid', async () => {
    window.localStorage.setItem('sabz-theme', 'neon');
    const trigger = await renderToggle();
    await waitFor(() =>
      expect(trigger.getAttribute('aria-label')).toBe('پوسته: هماهنگ با سیستم'),
    );
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('is keyboard operable and restores focus on Escape', async () => {
    const trigger = await renderToggle();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(trigger);

    const menu = await screen.findByRole('menu', { name: 'انتخاب پوسته' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('menuitemradio', { name: 'هماهنگ با سیستم' }),
      ),
    );
    expect(
      screen
        .getByRole('menuitemradio', { name: 'هماهنگ با سیستم' })
        .getAttribute('aria-checked'),
    ).toBe('true');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitemradio', { name: 'روشن' }),
    );

    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
