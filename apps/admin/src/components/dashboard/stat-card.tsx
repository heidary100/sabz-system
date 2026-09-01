import clsx from 'clsx'

export type StatCardTone = 'primary' | 'zinc' | 'green' | 'red' | 'amber'

const TONES: Record<StatCardTone, string> = {
  primary: 'text-primary-dark dark:text-primary',
  zinc: 'text-zinc-700 dark:text-zinc-300',
  green: 'text-green-700 dark:text-green-400',
  red: 'text-red-700 dark:text-red-400',
  amber: 'text-amber-700 dark:text-amber-400',
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
    <div className="glass flex flex-col gap-1 rounded-xl p-4">
      <span className="text-sm/5 font-medium text-muted">{label}</span>
      <span className={clsx('text-3xl/9 font-bold tabular-nums', TONES[tone])}>
        {value}
      </span>
    </div>
  )
}