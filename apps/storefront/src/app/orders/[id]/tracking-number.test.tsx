// @vitest-environment jsdom
import type { ShippingMethodCode } from '@sabz/types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCarrierTrackingUrl } from '@/lib/carrier-tracking';
import { TrackingNumberValue } from './tracking-number';

const TIPAX_NUMBER = '123456789012345';
const IRAN_POST_NUMBER = '123456789012345678901234';

function renderValue(method: ShippingMethodCode, trackingNumber: string) {
  return render(
    <TrackingNumberValue
      method={method}
      trackingNumber={trackingNumber}
    />,
  );
}

describe('TrackingNumberValue', () => {
  afterEach(() => cleanup());

  it('links a supported TIPAX number with safe new-tab attributes', () => {
    renderValue('TIPAX', TIPAX_NUMBER);

    const link = screen.getByRole('link', {
      name: /پیگیری مرسوله با تیپاکس/,
    });
    const href = link.getAttribute('href');

    expect(href).toBe(buildCarrierTrackingUrl('TIPAX', TIPAX_NUMBER));
    expect(new URL(href ?? '').origin).toBe('https://tipaxco.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.textContent).toContain(TIPAX_NUMBER);
    expect(link.textContent).toContain('پنجره جدید');
  });

  it('links a supported Iran Post number with the Persian carrier label', () => {
    renderValue('IRAN_POST', IRAN_POST_NUMBER);

    const link = screen.getByRole('link', {
      name: /پیگیری مرسوله با پست ایران/,
    });
    const href = link.getAttribute('href');

    expect(href).toBe(
      buildCarrierTrackingUrl('IRAN_POST', IRAN_POST_NUMBER),
    );
    expect(new URL(href ?? '').origin).toBe('https://tracking.post.ir');
    expect(link.textContent).toContain('پنجره جدید');
  });

  it('keeps an unsupported TIPAX format as plain text', () => {
    renderValue('TIPAX', 'TIPAX-12345');

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('TIPAX-12345')).toBeTruthy();
  });

  it('keeps an unsupported Iran Post format as plain text', () => {
    renderValue('IRAN_POST', '123456789012345');

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('123456789012345')).toBeTruthy();
  });

  it('keeps local delivery as plain text', () => {
    renderValue('LOCAL_DELIVERY', TIPAX_NUMBER);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(TIPAX_NUMBER)).toBeTruthy();
  });

  it('keeps store pickup as plain text', () => {
    renderValue('STORE_PICKUP', TIPAX_NUMBER);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(TIPAX_NUMBER)).toBeTruthy();
  });

  it('keeps an unknown method as plain text', () => {
    renderValue('UNKNOWN' as ShippingMethodCode, TIPAX_NUMBER);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(TIPAX_NUMBER)).toBeTruthy();
  });

  it('renders nothing for a missing or whitespace-only number', () => {
    const empty = renderValue('TIPAX', '');
    expect(empty.container.textContent).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();

    const whitespace = renderValue('TIPAX', '   ');
    expect(whitespace.container.textContent).toBe('');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('marks the number as an untranslated LTR identifier', () => {
    renderValue('TIPAX', TIPAX_NUMBER);

    const link = screen.getByRole('link');
    const identifier = link.querySelector('span[translate="no"]');

    expect(identifier).not.toBeNull();
    expect(identifier?.getAttribute('dir')).toBe('ltr');
    expect(identifier?.textContent).toBe(TIPAX_NUMBER);
  });
});
