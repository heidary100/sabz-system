import type { AddressDto } from '@sabz/types';
import { AddressForm } from './address-form';

/**
 * Address picker (SS-233): radio list over the address book plus the
 * new-address form. The chosen id is snapshotted into the order at
 * place-time — later book edits cannot rewrite history (ORDER-003).
 */
export function AddressPicker({
  addresses,
  selectedId,
  onSelect,
  onCreated,
}: {
  addresses: AddressDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreated: (row: AddressDto) => void;
}) {
  if (addresses.length === 0) {
    return (
      <div>
        <p className="text-sm leading-6 text-fg-secondary">
          هنوز نشانی ثبت نکرده‌اید؛ برای ادامه تسویه یک نشانی اضافه کنید.
        </p>
        <div className="mt-3">
          <AddressForm onCreated={onCreated} />
        </div>
      </div>
    );
  }
  return (
    <div>
      <div role="radiogroup" aria-label="انتخاب نشانی تحویل" className="space-y-3">
        {addresses.map((row) => (
          <label
            key={row.id}
            className={`flex cursor-pointer items-start gap-3 rounded-card border bg-surface p-4 ${
              row.id === selectedId ? 'border-accent' : 'border-border'
            }`}
          >
            <input
              type="radio"
              name="checkout-address"
              value={row.id}
              checked={row.id === selectedId}
              onChange={() => onSelect(row.id)}
              className="mt-1 size-4 accent-accent"
            />
            <span className="text-sm leading-6">
              <span className="font-bold text-fg">
                {row.label ?? 'نشانی'}
                {row.isDefault ? ' (پیش‌فرض)' : ''}
              </span>
              <br />
              <span className="text-fg-secondary">
                {row.fullName} — <span dir="ltr">{row.phone}</span>
              </span>
              <br />
              <span className="text-fg-secondary">
                {[row.province, row.city, row.address].filter(Boolean).join('، ')}
                {row.postalCode !== null ? ` — کد پستی ${row.postalCode}` : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3">
        <AddressForm onCreated={onCreated} />
      </div>
    </div>
  );
}
