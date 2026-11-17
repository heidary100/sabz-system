import { describe, expect, it } from 'vitest';
import {
  isThemeMode,
  readStoredMode,
  resolveTheme,
  THEME_BOOT_SCRIPT,
  THEME_COLORS,
  THEME_STORAGE_KEY,
} from './theme';

function storageWith(value: string | null): Pick<Storage, 'getItem'> {
  return { getItem: () => value };
}

describe('theme preference contract', () => {
  it('accepts only the three supported modes', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('neon')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it('reads a valid stored preference', () => {
    expect(readStoredMode(storageWith('light'))).toBe('light');
    expect(readStoredMode(storageWith('dark'))).toBe('dark');
    expect(readStoredMode(storageWith('system'))).toBe('system');
  });

  it('falls back to system for invalid or unavailable storage', () => {
    expect(readStoredMode(storageWith('purple'))).toBe('system');
    expect(readStoredMode(storageWith(null))).toBe('system');
    expect(readStoredMode(null)).toBe('system');
    expect(
      readStoredMode({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe('system');
  });

  it('resolves light, dark and system modes', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('keeps a blocking boot script with the persisted key and theme colors', () => {
    expect(THEME_BOOT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOT_SCRIPT).toContain(THEME_COLORS.light);
    expect(THEME_BOOT_SCRIPT).toContain(THEME_COLORS.dark);
    expect(THEME_BOOT_SCRIPT).toContain('prefers-color-scheme');
    expect(THEME_BOOT_SCRIPT).toContain('dataset.theme');
    expect(THEME_BOOT_SCRIPT.toLowerCase()).not.toContain('settimeout');
  });
});
