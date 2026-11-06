import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { BlogCategoryDto, BlogPostDetailDto, BlogStatus } from '@sabz/types'
import { translateApiError } from '../lib/error-messages'
import { BLOG_STATUS_LABELS, BLOG_STATUS_ORDER } from '../lib/blog-labels'
import { Newspaper } from 'lucide-react'
import { Button } from '../components/catalyst/button'
import { ErrorMessage, Field, Label } from '../components/catalyst/fieldset'
import { Heading } from '../components/catalyst/heading'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
import { Text } from '../components/catalyst/text'
import { Textarea } from '../components/catalyst/textarea'
import { ContentEditor } from '../components/products/content-editor/content-editor'
import { EmptyState } from '../components/ui/empty-state'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import {
  createPost,
  getAdminPost,
  listCategories,
  updatePost,
} from '../services/blog'

/**
 * Dedicated full-page blog editor (SS-240E). Serves both creation
 * (`/blog/new`) and editing (`/blog/:id/edit`) through the same workspace:
 * metadata fields plus the shared TipTap `ContentEditor` (product-description
 * sanitizer compatible — the blog API reuses it). Image upload stays
 * disabled (no `productId`): covers go through the URL field.
 */
export function BlogEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = Boolean(id)

  const [post, setPost] = useState<BlogPostDetailDto | null>(null)
  const [fetching, setFetching] = useState(isEdit)
  const [fetchError, setFetchError] = useState<unknown>(null)

  const [categories, setCategories] = useState<BlogCategoryDto[]>([])

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [content, setContent] = useState('')
  const [metaTitle, setMetaTitle] = useState('')
  const [metaDescription, setMetaDescription] = useState('')
  const [status, setStatus] = useState<BlogStatus>('DRAFT')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fillFromPost = useCallback((row: BlogPostDetailDto) => {
    setPost(row)
    setTitle(row.title)
    setSlug(row.slug)
    setCategoryId('')
    setAuthorName(row.authorName ?? '')
    setCoverImageUrl(row.coverImageUrl ?? '')
    setExcerpt(row.excerpt ?? '')
    setContent(row.content)
    setMetaTitle(row.metaTitle ?? '')
    setMetaDescription(row.metaDescription ?? '')
    setStatus(row.status)
  }, [])

  const refetchPost = useCallback(async () => {
    if (!id) {
      return
    }
    setFetching(true)
    setFetchError(null)
    try {
      fillFromPost(await getAdminPost(id))
    } catch (error) {
      setFetchError(error)
      setPost(null)
    } finally {
      setFetching(false)
    }
  }, [id, fillFromPost])

  useEffect(() => {
    if (isEdit) {
      void refetchPost()
    }
  }, [isEdit, refetchPost])

  useEffect(() => {
    let cancelled = false
    void listCategories()
      .then((rows) => {
        if (!cancelled) {
          setCategories(rows)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategories([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Resolve the post's category id once both the post and the category list
  // are loaded (the detail projection only carries slug + name).
  useEffect(() => {
    if (post?.category && categories.length > 0) {
      const match = categories.find((row) => row.slug === post.category?.slug)
      setCategoryId(match?.id ?? '')
    }
  }, [post, categories])

  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !submitting

  const handleSubmit = async (): Promise<void> => {
    if (!title.trim()) {
      setError('عنوان مطلب الزامی است.')
      return
    }
    if (!content.trim()) {
      setError('متن مطلب الزامی است.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      if (isEdit && id) {
        const saved = await updatePost(id, {
          title: title.trim(),
          slug: slug.trim() || undefined,
          categoryId: categoryId || null,
          authorName: authorName.trim() || null,
          coverImageUrl: coverImageUrl.trim() || null,
          excerpt: excerpt.trim() || null,
          content,
          metaTitle: metaTitle.trim() || null,
          metaDescription: metaDescription.trim() || null,
          status,
        })
        fillFromPost(saved)
      } else {
        const saved = await createPost({
          title: title.trim(),
          ...(slug.trim() ? { slug: slug.trim() } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(authorName.trim() ? { authorName: authorName.trim() } : {}),
          ...(coverImageUrl.trim() ? { coverImageUrl: coverImageUrl.trim() } : {}),
          ...(excerpt.trim() ? { excerpt: excerpt.trim() } : {}),
          content,
          ...(metaTitle.trim() ? { metaTitle: metaTitle.trim() } : {}),
          ...(metaDescription.trim() ? { metaDescription: metaDescription.trim() } : {}),
          status,
        })
        navigate(`/blog/${saved.id}/edit`)
      }
    } catch (error) {
      setError(translateApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  if (isEdit) {
    if (fetching && !post) {
      return <Loading label="در حال بارگذاری مطلب…" />
    }
    if (fetchError && !post) {
      return (
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="surface-card flex flex-col items-center gap-4 rounded-xl px-6 py-16 text-center">
            <p className="text-sm/6 text-muted">{translateApiError(fetchError)}</p>
            <Button color="primary" onClick={() => void refetchPost()}>
              تلاش مجدد
            </Button>
            <Link to="/blog" className="text-sm font-medium text-primary hover:underline">
              بازگشت به وبلاگ
            </Link>
          </div>
        </div>
      )
    }
    if (!post) {
      return (
        <div className="mx-auto max-w-6xl space-y-6">
          <EmptyState
            icon={<Newspaper />}
            title="مطلب یافت نشد"
            description="این مطلب در دسترس نیست."
            actions={
              <Link to="/blog">
                <Button outline>بازگشت به وبلاگ</Button>
              </Link>
            }
          />
        </div>
      )
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={isEdit ? 'ویرایش مطلب' : 'مطلب جدید'}
        subtitle={isEdit ? post?.slug : 'پیش‌نویس تازه؛ انتشار از همین صفحه'}
        actions={
          <>
            <Link to="/blog">
              <Button outline disabled={submitting}>
                انصراف
              </Button>
            </Link>
            <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {submitting ? 'در حال ذخیره…' : 'ذخیره'}
            </Button>
          </>
        }
      />

      {error && (
        <p className="danger-box rounded-lg px-3 py-2 text-sm" role="alert">
          {error}
        </p>
      )}

      <div className="surface-card space-y-5 rounded-xl p-5">
        <Field>
          <Label>عنوان</Label>
          <Input
            name="title"
            value={title}
            maxLength={255}
            onChange={(event) => setTitle(event.target.value)}
            disabled={submitting}
          />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <Label>اسلاگ</Label>
            <Input
              name="slug"
              dir="ltr"
              value={slug}
              maxLength={255}
              placeholder="در صورت خالی بودن، از عنوان ساخته می‌شود"
              onChange={(event) => setSlug(event.target.value)}
              disabled={submitting}
            />
            <Text className="text-xs text-muted">
              فقط حروف انگلیسی کوچک، اعداد و خط تیره.
            </Text>
          </Field>

          <Field>
            <Label>دسته‌بندی</Label>
            <Select
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={submitting}
            >
              <option value="">بدون دسته‌بندی</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <Label>نویسنده</Label>
            <Input
              name="authorName"
              value={authorName}
              maxLength={255}
              placeholder="تحریریه سبز سیستم"
              onChange={(event) => setAuthorName(event.target.value)}
              disabled={submitting}
            />
          </Field>

          <Field>
            <Label>وضعیت</Label>
            <Select
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as BlogStatus)}
              disabled={submitting}
            >
              {BLOG_STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {BLOG_STATUS_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field>
          <Label>آدرس تصویر شاخص</Label>
          <Input
            name="coverImageUrl"
            dir="ltr"
            value={coverImageUrl}
            maxLength={2000}
            placeholder="https://…"
            onChange={(event) => setCoverImageUrl(event.target.value)}
            disabled={submitting}
          />
        </Field>

        <Field>
          <Label>خلاصه</Label>
          <Textarea
            name="excerpt"
            value={excerpt}
            maxLength={2000}
            rows={2}
            onChange={(event) => setExcerpt(event.target.value)}
            disabled={submitting}
          />
          <Text className="text-xs text-muted">{excerpt.length}/2000</Text>
        </Field>
      </div>

      <div className="space-y-2">
        <Heading level={2} className="text-base font-bold">
          متن مطلب
        </Heading>
        <ContentEditor value={content} onChange={setContent} disabled={submitting} />
      </div>

      <div className="surface-card space-y-5 rounded-xl p-5">
        <Field>
          <Label>عنوان سئو</Label>
          <Input
            name="metaTitle"
            value={metaTitle}
            maxLength={255}
            placeholder="در صورت خالی بودن، از عنوان استفاده می‌شود"
            onChange={(event) => setMetaTitle(event.target.value)}
            disabled={submitting}
          />
        </Field>

        <Field>
          <Label>توضیح سئو</Label>
          <Textarea
            name="metaDescription"
            value={metaDescription}
            maxLength={500}
            rows={2}
            onChange={(event) => setMetaDescription(event.target.value)}
            disabled={submitting}
          />
          <Text className="text-xs text-muted">{metaDescription.length}/500</Text>
        </Field>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <div className="flex flex-wrap items-center gap-2">
          <Button color="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {submitting ? 'در حال ذخیره…' : 'ذخیره'}
          </Button>
          <Link to="/blog">
            <Button outline disabled={submitting}>
              بازگشت به وبلاگ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
