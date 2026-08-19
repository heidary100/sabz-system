import clsx from 'clsx'

export type StatCardTone = 'primary' | 'zinc' | 'green' | 'red' | 'amber'

const TONES: Record<StatCardTone, string> = {
  primary: 'text-primary-dark',
  zinc: 'text-zinc-700',
  green: 'text-green-700',
  red: 'text-red-700',
  amber: 'text-amber-700',
}

export function StatCard({
  label,
  value,
  tone = 'zinc',
}: {
  label: string
  value: number
  tone?: StatCardTone
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-white p-4">
      <span className="text-sm/5 font-medium text-dust-200">{label}</span>
      <span className={clsx('text-3xl/9 font-bold tabular-nums', TONES[tone])}>
        {value}
      </span>
    </div>
  )
}