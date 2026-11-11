import { useId, useState } from 'react'
import type {
  BlogFeatureSection,
  HomepageValidationIssue,
} from '@sabz/types'
import { MERCH_BLOG_FEATURE_MAX_POSTS } from '@sabz/types'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../catalyst/button'
import { Description, Field, Label } from '../../catalyst/fieldset'
import { Input } from '../../catalyst/input'
import { Select } from '../../catalyst/select'
import { Text } from '../../catalyst/text'
import { FieldError, FieldErrorMessage } from '../../ui/field-error'
import { InlineError } from '../../ui/inline-error'
import { StatusBadge } from '../../ui/status-badge'
import { useBlogPostDetails } from '../../../hooks/use-blog-post-details'
import { firstValidationMessage } from '../../../lib/merchandising-homepage'
import { formatDate } from '../../../lib/format'
import { HomepageBlogPickerDialog } from './homepage-blog-picker-dialog'

export function BlogFeatureSectionForm({
  section,
  issues,
  basePath,
  disabled = false,
  onSettingsChange,
}: {
  section: BlogFeatureSection
  issues: HomepageValidationIssue[]
  basePath: string
  disabled?: boolean
  onSettingsChange: (settings: BlogFeatureSection['settings']) => void
}) {
  const uid = useId()
  const modeId = `blog-feature-${uid}-mode`
  const modeErrorId = `${modeId}-error`
  const limitId = `blog-feature-${uid}-limit`
  const limitDescriptionId = `${limitId}-description`
  const limitErrorId = `${limitId}-error`
  const postIdsErrorId = `blog-feature-${uid}-post-ids-error`
  const [pickerOpen, setPickerOpen] = useState(false)
  const settings = section.settings
  const postIds = settings.source === 'manual' ? settings.postIds : []
  const { details, loading, errors } = useBlogPostDetails(postIds)
  const modeError = firstValidationMessage(issues, basePath, 'source')
  const limitError = firstValidationMessage(issues, basePath, 'limit')
  const postIdsError =
    issues.find((issue) => issue.path === `${basePath}.postIds`)?.message ??
    null

  const movePost = (index: number, direction: -1 | 1): void => {
    if (settings.source !== 'manual') {
      return
    }
    const target = index + direction
    if (target < 0 || target >= postIds.length) {
      return
    }
    const next = [...postIds]
    const [id] = next.splice(index, 1)
    next.splice(target, 0, id!)
    onSettingsChange({ source: 'manual', postIds: next })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <Field>
          <Label htmlFor={modeId}>حالت انتخاب مطالب</Label>
          <Select
            id={modeId}
            value={settings.source}
            disabled={disabled}
            invalid={Boolean(modeError)}
            onChange={(event) => {
              const source = event.target.value
              if (source === 'latest') {
                onSettingsChange({ source: 'latest', limit: 3 })
              } else {
                onSettingsChange({ source: 'manual', postIds: [] })
              }
            }}
          >
            <option value="latest">آخرین مطالب منتشرشده</option>
            <option value="manual">انتخاب دستی مطالب</option>
          </Select>
          <FieldErrorMessage id={modeErrorId} message={modeError} />
        </Field>

        {settings.source === 'latest' ? (
          <Field>
            <Label htmlFor={limitId}>تعداد مطالب</Label>
            <Input
              id={limitId}
              type="number"
              min={1}
              max={MERCH_BLOG_FEATURE_MAX_POSTS}
              value={settings.limit}
              disabled={disabled}
              invalid={Boolean(limitError)}
              onChange={(event) =>
                onSettingsChange({
                  source: 'latest',
                  limit: Number(event.target.value),
                })
              }
            />
            <Description className="text-xs text-muted" id={limitDescriptionId}>
              ۱ تا {MERCH_BLOG_FEATURE_MAX_POSTS.toLocaleString('fa-IR')} مطلب
              منتشرشده جدید.
            </Description>
            <FieldErrorMessage id={limitErrorId} message={limitError} />
          </Field>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  مطالب انتخاب‌شده ({postIds.length.toLocaleString('fa-IR')} از{' '}
                  {MERCH_BLOG_FEATURE_MAX_POSTS.toLocaleString('fa-IR')})
                </p>
                <Text className="text-xs text-muted">
                  فقط مطالب منتشرشده و یکتا. API وبلاگ جستجو/فیلتر دسته‌بندی
                  ندارد.
                </Text>
              </div>
              <Button
                outline
                disabled={
                  disabled ||
                  postIds.length >= MERCH_BLOG_FEATURE_MAX_POSTS
                }
                aria-describedby={postIdsError ? postIdsErrorId : undefined}
                onClick={() => setPickerOpen(true)}
              >
                <Plus data-slot="icon" />
                افزودن مطلب
              </Button>
            </div>
            <FieldError id={postIdsErrorId} message={postIdsError} />
            {postIds.length === 0 ? (
              <Text className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-warning">
                حداقل یک مطلب منتشرشده انتخاب کنید.
              </Text>
            ) : (
              <ol
                aria-describedby={postIdsError ? postIdsErrorId : undefined}
                className="divide-y divide-border rounded-xl border border-border bg-background/40"
              >
                {postIds.map((postId, index) => {
                  const displayIndex = (index + 1).toLocaleString('fa-IR')
                  const detail = details[postId]
                  const itemError = firstValidationMessage(
                    issues,
                    basePath,
                    `postIds[${index}]`,
                  )
                  return (
                    <li
                      key={postId}
                      className="flex flex-wrap items-center gap-2 px-3 py-2"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-semibold tabular-nums text-foreground">
                        {displayIndex}
                      </span>
                      <div className="min-w-0 flex-1">
                        {detail ? (
                          <>
                            <p className="truncate text-sm font-medium text-foreground">
                              {detail.title}
                            </p>
                            <p className="text-xs text-muted">
                              {detail.category?.name ?? 'بدون دسته'} ·{' '}
                              {formatDate(detail.publishedAt)}
                            </p>
                            {detail.status !== 'PUBLISHED' && (
                              <Text className="text-xs text-danger">
                                این مطلب اکنون منتشرشده نیست.
                              </Text>
                            )}
                          </>
                        ) : loading[postId] ? (
                          <Text className="text-xs text-muted" role="status">
                            در حال بارگذاری مطلب…
                          </Text>
                        ) : (
                          <Text className="text-xs text-muted" dir="ltr">
                            {postId}
                          </Text>
                        )}
                        {errors[postId] && (
                          <InlineError message={errors[postId]!} />
                        )}
                        {itemError && (
                          <Text className="text-sm text-danger">{itemError}</Text>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          plain
                          aria-label={`جابه‌جایی مطلب ${displayIndex} به بالا`}
                          disabled={disabled || index === 0}
                          onClick={() => movePost(index, -1)}
                        >
                          <ChevronUp data-slot="icon" />
                        </Button>
                        <Button
                          plain
                          aria-label={`جابه‌جایی مطلب ${displayIndex} به پایین`}
                          disabled={disabled || index === postIds.length - 1}
                          onClick={() => movePost(index, 1)}
                        >
                          <ChevronDown data-slot="icon" />
                        </Button>
                        <Button
                          plain
                          aria-label={`حذف مطلب ${displayIndex}`}
                          disabled={disabled}
                          onClick={() =>
                            onSettingsChange({
                              source: 'manual',
                              postIds: postIds.filter((id) => id !== postId),
                            })
                          }
                        >
                          <Trash2 data-slot="icon" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
            <StatusBadge tone="neutral">
              {postIds.length.toLocaleString('fa-IR')} مطلب انتخاب‌شده
            </StatusBadge>
          </div>
        )}
      </div>

      <Text className="text-xs text-muted">
        حالت «آخرین مطالب» شناسه‌های دستی را ذخیره نمی‌کند؛ با تغییر حالت،
        تنظیمات ناسازگار قبلی حذف می‌شوند.
      </Text>

      <HomepageBlogPickerDialog
        open={pickerOpen}
        selectedIds={postIds}
        maxReached={postIds.length >= MERCH_BLOG_FEATURE_MAX_POSTS}
        onPick={(post) => {
          if (!postIds.includes(post.id)) {
            onSettingsChange({
              source: 'manual',
              postIds: [...postIds, post.id],
            })
          }
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
