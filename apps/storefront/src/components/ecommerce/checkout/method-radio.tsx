/**
 * Choice radio cards (SS-233): generic picker for shipping and payment
 * methods. Renders honest v1 stubs — fees and gateway notes come from the
 * server payload, never invented client-side.
 */
export function MethodRadio<T extends string>({
  name,
  options,
  selected,
  onSelect,
}: {
  name: string;
  options: Array<{ code: T; title: string; desc: string }>;
  selected: T | null;
  onSelect: (code: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-3">
      {options.map((option) => (
        <label
          key={option.code}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 ${
            option.code === selected ? 'border-sabz-600' : 'border-sand-200'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.code}
            checked={option.code === selected}
            onChange={() => onSelect(option.code)}
            className="mt-1 size-4 accent-sabz-800"
          />
          <span className="text-sm leading-6">
            <span className="font-bold text-ink-900">{option.title}</span>
            <br />
            <span className="text-gray-600">{option.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
