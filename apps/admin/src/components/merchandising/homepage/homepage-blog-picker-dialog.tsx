import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminBlogPostListItemDto, AdminBlogPostListResponse } from '@sabz/types'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../catalyst/alert'
import { Button } from '../../catalyst/button'
import { Text } from '../../catalyst/text'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../catalyst/table'
import { EmptyState } from '../../ui/empty-state'
import { ErrorState } from '../../ui/error-state'
import { Loading } from '../../ui/loading'
import { TablePagination } from '../../ui/table-pagination'
import { formatDate } from '../../../lib/format'
import { translateApiError } from '../../../lib/error-messages'
import { listAdminPosts } from '../../../services/blog'

const PAGE_SIZE = 20

export function HomepageBlogPickerDialog({
  open,
  selectedIds,
  maxReached,
  onPick,
  onClose,
}: {
  open: boolean
  selectedIds: string[]
  maxReached: boolean
  onPick: (post: AdminBlogPostListItemDto) => void
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<AdminBlogPostListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (open) {
      setPage(1)
    }
  }, [open])

  const refetch = useCallback(async () => {
    if (!open) {
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await listAdminPosts({
        status: 'PUBLISHED',
        page,
        limit: PAGE_SIZE,
      })
      if (seq === requestSeq.current) {
        setResult(data)
      }
    } catch (error) {
      if (seq === requestSeq.current) {
        setError(error)
        setResult(null)
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [open, page])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1

  return (
    <Alert open={open} onClose={onClose} size="4xl">
      <AlertTitle>انتخاب مطلب وبلاگ</AlertTitle>
      <AlertDescription>
        فقط مطالب منتشرشده قابل انتخاب‌اند. API وبلاگ در حال حاضر جستجو یا
        فیلتر دسته‌بندی ندارد؛ برای یافتن مطلب از صفحه‌بندی استفاده کنید.
      </AlertDescription>
      <AlertBody>
        {loading && !result ? (
          <Loading compact label="در حال بارگذاری مطالب…" />
        ) : error ? (
          <ErrorState
            size="compact"
            message={translateApiError(error)}
            onRetry={() => void refetch()}
          />
        ) : !result || result.items.length === 0 ? (
          <EmptyState
            size="compact"
            title="مطلب منتشرشده‌ای پیدا نشد"
            description="ابتدا مطلب را در بخش وبلاگ منتشر کنید."
          />
        ) : (
          <>
            <TablePagination
              position="top"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="مطلب"
            />
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>عنوان</TableHeader>
                  <TableHeader>دسته</TableHeader>
                  <TableHeader>انتشار</TableHeader>
                  <TableHeader>عملیات</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.items.map((post) => {
                  const selected = selectedIds.includes(post.id)
                  return (
                    <TableRow key={post.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {post.title}
                        </p>
                        <p dir="ltr" className="text-xs text-muted">
                          {post.slug}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted">
                        {post.category?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted">
                        {formatDate(post.publishedAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          outline
                          disabled={selected || maxReached}
                          onClick={() => onPick(post)}
                        >
                          {selected
                            ? 'افزوده‌شده'
                            : maxReached
                              ? 'محدودیت تکمیل است'
                              : 'افزودن'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <TablePagination
              position="bottom"
              page={page}
              totalPages={totalPages}
              total={result.total}
              onPageChange={setPage}
              limit={PAGE_SIZE}
              disabled={loading}
              totalLabel="مطلب"
            />
          </>
        )}
        <Text className="mt-3 text-xs text-muted">
          حداکثر ۳ مطلب در بخش ویژه وبلاگ.
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
