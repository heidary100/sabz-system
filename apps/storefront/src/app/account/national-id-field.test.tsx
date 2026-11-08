// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { NationalIdField } from './national-id-field';

const VALID = '6059926746';
const MASKED = '****6746';

function renderField(overrides: Partial<Parameters<typeof NationalIdField>[0]> = {}) {
  const onSave =
    overrides.onSave ??
    vi.fn().mockResolvedValue({
      hasNationalId: true,
      maskedNationalId: MASKED,
    });
  const onUnauthorized = overrides.onUnauthorized ?? vi.fn();
  const initialHasNationalId = overrides.hasNationalId ?? false;
  const initialMaskedNationalId = overrides.maskedNationalId ?? null;

  function Wrapper() {
    const [hasNationalId, setHasNationalId] = useState(initialHasNationalId);
    const [maskedNationalId, setMaskedNationalId] = useState(
      initialMaskedNationalId,
    );
    return (
      <NationalIdField
        hasNationalId={hasNationalId}
        maskedNationalId={maskedNationalId}
        onSave={async (value) => {
          const result = await onSave(value);
          setHasNationalId(result.hasNationalId);
          setMaskedNationalId(result.maskedNationalId);
          return result;
        }}
        onUnauthorized={onUnauthorized}
      />
    );
  }

  render(<Wrapper />);
  return { onSave, onUnauthorized };
}

describe('NationalIdField (SS-260)', () => {
  afterEach(() => cleanup());

  it('renders an unregistered empty field with an explicit label', () => {
    renderField();

    expect(screen.getByLabelText('کد ملی')).toHaveProperty('value', '');
    expect(screen.getByText('کد ملی ثبت نشده است.')).toBeTruthy();
    expect(
      screen.getByText('این بررسی فقط ساختار کد ملی را می‌سنجد و هویت شما را تأیید نمی‌کند.'),
    ).toBeTruthy();
  });

  it('does not autofocus the input on initial render', () => {
    renderField();
    const input = screen.getByLabelText('کد ملی');

    expect(document.activeElement).not.toBe(input);
  });

  it('folds Persian digits while typing without stripping separators', () => {
    renderField();
    const input = screen.getByLabelText('کد ملی') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '۶۰۵۹۹۲۶۷۴۶' } });
    expect(input.value).toBe(VALID);

    fireEvent.change(input, { target: { value: '۶۰۵-۹۹۲-۶۷۴۶' } });
    expect(input.value).toBe('605-992-6746');
  });

  it('inserts pasted digits at the cursor instead of replacing the field', () => {
    renderField();
    const input = screen.getByLabelText('کد ملی') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '60599' } });
    input.setSelectionRange(5, 5);
    fireEvent.paste(input, {
      clipboardData: { getData: () => '26746' },
    });

    expect(input.value).toBe(VALID);
  });

  it('shows an inline format error and does not call the server', async () => {
    const { onSave } = renderField();
    const input = screen.getByLabelText('کد ملی');

    fireEvent.change(input, { target: { value: '605-992-6746' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره کد ملی' }));

    expect(
      await screen.findByText('کد ملی باید دقیقاً ۱۰ رقم باشد.'),
    ).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a checksum error for a ten-digit invalid value', async () => {
    const { onSave } = renderField();
    const input = screen.getByLabelText('کد ملی');

    fireEvent.change(input, { target: { value: '6059926747' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره کد ملی' }));

    expect(
      await screen.findByText(
        'کد ملی واردشده معتبر نیست؛ رقم کنترل را بررسی کنید.',
      ),
    ).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the explicit leading-zero error', async () => {
    const { onSave } = renderField();
    const input = screen.getByLabelText('کد ملی');

    fireEvent.change(input, { target: { value: '0013542419' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره کد ملی' }));

    expect(
      await screen.findByText('کد ملی نمی‌تواند با صفر شروع شود.'),
    ).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('submits a valid value, clears the input and shows the mask', async () => {
    const { onSave } = renderField();
    const input = screen.getByLabelText('کد ملی') as HTMLInputElement;

    fireEvent.change(input, { target: { value: '۶۰۵۹۹۲۶۷۴۶' } });
    expect(screen.getByText('قالب کد ملی درست است.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره کد ملی' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(VALID));
    expect(await screen.findByText('کد ملی ذخیره شد.')).toBeTruthy();
    expect(screen.queryByDisplayValue(VALID)).toBeNull();
    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByText(VALID)).toBeNull();
  });

  it('shows the masked saved state without prefilling the input', () => {
    renderField({
      hasNationalId: true,
      maskedNationalId: MASKED,
    });

    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByDisplayValue(VALID)).toBeNull();
    expect(screen.queryByLabelText('کد ملی')).toBeNull();
  });

  it('syncs when the parent discovers an existing value after a failed load', () => {
    const onSave = vi.fn();
    const onUnauthorized = vi.fn();
    const { rerender } = render(
      <NationalIdField
        hasNationalId={false}
        maskedNationalId={null}
        onSave={onSave}
        onUnauthorized={onUnauthorized}
      />,
    );

    expect(screen.getByText('کد ملی ثبت نشده است.')).toBeTruthy();

    rerender(
      <NationalIdField
        hasNationalId={true}
        maskedNationalId={MASKED}
        onSave={onSave}
        onUnauthorized={onUnauthorized}
      />,
    );

    expect(screen.getByText(MASKED)).toBeTruthy();
    expect(screen.queryByLabelText('کد ملی')).toBeNull();
  });

  it('opens an empty replacement input and preserves the previous state on cancel', () => {
    renderField({
      hasNationalId: true,
      maskedNationalId: MASKED,
    });

    fireEvent.click(screen.getByRole('button', { name: 'تغییر کد ملی' }));
    const input = screen.getByLabelText('کد ملی') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(screen.getByText('کد ملی جدید جایگزین مقدار فعلی می‌شود.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(screen.getByText(MASKED)).toBeTruthy();
  });

  it('shows the server message and preserves the saved mask on failure', async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiError(400, {
        statusCode: 400,
        message: 'کد ملی واردشده معتبر نیست؛ رقم کنترل را بررسی کنید.',
        error: 'Bad Request',
      }),
    );
    renderField({
      hasNationalId: true,
      maskedNationalId: MASKED,
      onSave,
    });

    fireEvent.click(screen.getByRole('button', { name: 'تغییر کد ملی' }));
    fireEvent.change(screen.getByLabelText('کد ملی'), {
      target: { value: '7291363357' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره کد ملی' }));

    expect(
      await screen.findByText(
        'کد ملی واردشده معتبر نیست؛ رقم کنترل را بررسی کنید.',
      ),
    ).toBeTruthy();
    expect(screen.getByText(MASKED)).toBeTruthy();
  });

  it('redirects on a 401 response', async () => {
    const onUnauthorized = vi.fn();
    const onSave = vi.fn().mockRejectedValue(
      new ApiError(401, {
        statusCode: 401,
        message: 'نشست منقضی شده است',
        error: 'Unauthorized',
      }),
    );
    renderField({ onSave, onUnauthorized });

    fireEvent.change(screen.getByLabelText('کد ملی'), {
      target: { value: VALID },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره کد ملی' }));

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});
