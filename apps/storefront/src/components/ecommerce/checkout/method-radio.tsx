/**
 * Choice radio cards (SS-233, SS-234): generic picker for shipping and
 * payment methods. Renders honest v1 stubs — fees and gateway notes come
 * from the server payload, never invented client-side. Options flagged
 * `disabled` (SS-234: ONLINE while the gateway is stubbed) render as
 * real disabled radios with reduced-motion-safe styling.
 */
export function MethodRadio<T extends string>({
  name,
  options,
  selected,
  onSelect,
}: {
  name: string;
  options: Array<{ code: T; title: string; desc: string; disabled?: boolean }>;
  selected: T | null;
  onSelect: (code: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-3">
      {options.map((option) => (
        <label
          key={option.code}
          className={`flex items-start gap-3 rounded-card border bg-surface p-4 ${
            option.disabled
              ? 'cursor-not-allowed border-border opacity-60'
              : option.code === selected
                ? 'cursor-pointer border-accent'
                : 'cursor-pointer border-border'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.code}
            checked={option.code === selected}
            disabled={option.disabled}
            onChange={() => onSelect(option.code)}
            className="mt-1 size-4 accent-accent"
          />
          <span className="text-sm leading-6">
            <span className="font-bold text-fg">{option.title}</span>
            <br />
            <span className="text-fg-secondary">{option.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
