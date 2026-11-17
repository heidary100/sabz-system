import { useCallback, useEffect, useRef, useState } from 'react'
import type { CategoryTreeNode } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import { EmptyState } from '../../ui/empty-state'
import { ErrorState } from '../../ui/error-state'
import { Loading } from '../../ui/loading'
import { StatusBadge } from '../../ui/status-badge'
import { translateApiError } from '../../../lib/error-messages'
import { fetchCategoryTree } from '../../../services/categories'

interface FlatCategory {
  node: CategoryTreeNode
  depth: number
}

function flatten(nodes: CategoryTreeNode[], depth = 0): FlatCategory[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flatten(node.children, depth + 1),
  ])
}

export function CampaignCategoryPickerDialog({
  open,
  selectedIds,
  maxReached,
  pickLabel = 'افزودن',
  onPick,
  onClose,
}: {
  open: boolean
  selectedIds: string[]
  maxReached: boolean
  pickLabel?: string
  onPick: (category: CategoryTreeNode) => void
  onClose: () => void
}) {
  const [tree, setTree] = useState<CategoryTreeNode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  const refetch = useCallback(async () => {
    if (!open) {
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCategoryTree()
      if (seq === requestSeq.current) {
        setTree(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setTree(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [open])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const rows = tree ? flatten(tree) : []

  return (
    <Alert open={open} onClose={onClose} size="3xl">
      <AlertTitle>انتخاب دسته‌بندی</AlertTitle>
      <AlertDescription>
        ساختار درختی حفظ می‌شود. فقط دسته‌بندی‌های قابل نمایش در فروشگاه قابل
        انتخاب‌اند.
      </AlertDescription>
      <AlertBody>
        {loading && tree === null ? (
          <Loading compact label="در حال بارگذاری دسته‌بندی‌ها…" />
        ) : error ? (
          <ErrorState
            size="compact"
            message={translateApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            size="compact"
            title="دسته‌بندی‌ای پیدا نشد"
            description="ابتدا دسته‌بندی‌ها را در بخش کاتالوگ بسازید."
          />
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {rows.map(({ node, depth }) => {
              const selected = selectedIds.includes(node.id)
              const disabled = selected || maxReached || !node.isVisible
              return (
                <li
                  key={node.id}
                  className="flex flex-wrap items-center gap-3 bg-surface px-3 py-2"
                  style={{ paddingInlineStart: `${depth * 1.25 + 0.75}rem` }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {node.name}
                    </p>
                    <p dir="ltr" className="truncate text-xs text-muted">
                      {node.slug}
                    </p>
                  </div>
                  {!node.isVisible && (
                    <StatusBadge tone="neutral">پنهان در فروشگاه</StatusBadge>
                  )}
                  <span className="text-xs text-muted">
                    {node.productCount.toLocaleString('fa-IR')} محصول
                  </span>
                  <Button
                    outline
                    disabled={disabled}
                    onClick={() => onPick(node)}
                  >
                    {selected
                      ? 'افزوده‌شده'
                      : !node.isVisible
                        ? 'غیرقابل انتخاب'
                        : maxReached
                          ? 'محدودیت تکمیل است'
                          : pickLabel}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <Text className="mt-3 text-xs text-muted">
          حداکثر ۶ دسته‌بندی در هر کمپین.
        </Text>
      </AlertBody>
      <AlertActions>
        <Button outline onClick={onClose}>
          بستن
        </Button>
      </AlertActions>
    </Alert>
  )
}
