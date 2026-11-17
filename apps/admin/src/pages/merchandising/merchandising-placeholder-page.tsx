import { PageHeader } from '../../components/ui/page-header'
import { EmptyState } from '../../components/ui/empty-state'

/**
 * Temporary shell for a merchandising route whose screen is delivered by a
 * later SS-273 follow-up issue. It keeps navigation and route help coherent
 * without implementing unsupported controls or fabricated data.
 */
export function MerchandisingPlaceholderPage({
  title,
  subtitle,
  description,
}: {
  title: string
  subtitle: string
  description: string
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState
        title="این بخش در حال آماده‌سازی است."
        description={description}
      />
    </div>
  )
}
