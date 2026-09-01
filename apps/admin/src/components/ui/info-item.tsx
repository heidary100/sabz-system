export function InfoItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd dir="auto" className="text-sm text-foreground">{value || '—'}</dd>
    </div>
  )
}