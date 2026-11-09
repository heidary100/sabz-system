import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomepagePublicationDto } from '@sabz/types'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/catalyst/button'
import { Text } from '../../components/catalyst/text'
import { EmptyState } from '../../components/ui/empty-state'
import { ErrorState } from '../../components/ui/error-state'
import { Loading } from '../../components/ui/loading'
import { PageHeader } from '../../components/ui/page-header'
import { StatusBadge } from '../../components/ui/status-badge'
import { HomepagePublicationCancelDialog } from '../../components/merchandising/homepage/homepage-publication-cancel-dialog'
import { HomepagePublicationRollbackDialog } from '../../components/merchandising/homepage/homepage-publication-rollback-dialog'
import { HomepagePublicationAuditPanel } from '../../components/merchandising/homepage/homepage-publication-audit-panel'
import { useAuth } from '../../auth/auth-provider'
import { merchandisingErrorMessage } from '../../lib/merchandising-errors'
import {
  homepagePublicationStatusLabel,
  homepagePublicationStatusTone,
} from '../../lib/merchandising-status'
import { sectionTypeLabel } from '../../lib/merchandising-homepage'
import { formatTehranDateTime } from '../../lib/tehran-time'
import { getHomepagePublication } from '../../services/merchandising'

interface PublicationLocationState {
  justPublished?: boolean
  justScheduled?: boolean
  justRolledBack?: boolean
  publication?: HomepagePublicationDto
  expectedRevision?: number
  revisionMismatch?: boolean
  rollbackSourceVersion?: number
}

function statusExplanation(publication: HomepagePublicationDto): string {
  switch (publication.status) {
    case 'SCHEDULED':
      return publication.publishAt &&
        Date.parse(publication.publishAt) <= Date.now()
        ? 'زمان زمان‌بندی گذشته است؛ فعال‌سازی در انتظار پردازش سرور است. تا تأیید سرور، این نسخه را منتشرشده در نظر نگیرید.'
        : 'این نسخه در صف زمان‌بندی است و محتوای عمومی فعلی فروشگاه تغییر نکرده است. لغو فقط تا پیش از فعال‌سازی ممکن است.'
    case 'CANCELLED':
      return 'این نسخه لغو شده است. علت لغو فقط از روی رویدادهای ثبت‌شده سرور قابل تشخیص است و از وضعیت به‌تنهایی استنتاج نمی‌شود. محتوای عمومی فعلی فروشگاه تغییر نکرده است.'
    case 'SUPERSEDED':
      return 'این نسخه تاریخی و جایگزین‌شده است؛ محتوای شده تغییرناپذیر است و دیگر نسخه جاری نیست.'
    case 'PUBLISHED':
    default:
      return 'این نسخه منتشرشده جاری است و همان محتوایی است که فروشگاه عمومی استفاده می‌کند.'
  }
}

export function MerchandisingHomepagePublicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.roles.includes('ADMIN') ?? false
  const state = (location.state ?? {}) as PublicationLocationState
  const [publication, setPublication] = useState<HomepagePublicationDto | null>(
    state.publication ?? null,
  )
  const [loading, setLoading] = useState(state.publication === undefined)
  const [error, setError] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [auditKey, setAuditKey] = useState(0)
  const [rollbackSource, setRollbackSource] =
    useState<HomepagePublicationDto | null>(null)
  const requestSeq = useRef(0)
  const previousIdRef = useRef(id)

  useEffect(() => {
    if (previousIdRef.current === id) {
      return
    }
    previousIdRef.current = id
    requestSeq.current += 1
    setPublication(null)
    setLoading(true)
    setError(null)
    setMessage(null)
    setActionError(null)
    setCancelOpen(false)
    setRollbackOpen(false)
    setRollbackSource(null)
    setAuditKey((value) => value + 1)
  }, [id])

  const load = useCallback(async (): Promise<void> => {
    if (!id) {
      setPublication(null)
      setLoading(false)
      return
    }
    const seq = ++requestSeq.current
    setLoading(true)
    setError(null)
    try {
      const data = await getHomepagePublication(id)
      if (seq === requestSeq.current) {
        setPublication(data)
      }
    } catch (loadError) {
      if (seq === requestSeq.current) {
        setError(merchandisingErrorMessage(loadError))
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false)
      }
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const sourceId = publication?.rollbackFromPublicationId
    if (!sourceId) {
      setRollbackSource(null)
      return
    }
    let cancelled = false
    void getHomepagePublication(sourceId)
      .then((source) => {
        if (!cancelled) setRollbackSource(source)
      })
      .catch(() => {
        if (!cancelled) setRollbackSource(null)
      })
    return () => {
      cancelled = true
    }
  }, [publication?.rollbackFromPublicationId])

  const sourceVersion =
    rollbackSource?.version ?? state.rollbackSourceVersion ?? null

  const revisionMismatch =
    state.revisionMismatch === true ||
    (publication !== null &&
      state.expectedRevision !== undefined &&
      publication.sourceDraftRevision !== state.expectedRevision)

  const scheduled = publication?.status === 'SCHEDULED'

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <PageHeader
        title="جزئیات انتشار صفحه اصلی"
        subtitle="نسخه منتشرشده یا زمان‌بندی‌شده صفحه اصلی؛ همه زمان‌ها به وقت تهران نمایش داده می‌شوند."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && scheduled && (
              <Button color="danger" onClick={() => setCancelOpen(true)}>
                لغو انتشار زمان‌بندی‌شده
              </Button>
            )}
            {isAdmin && publication?.status === 'SUPERSEDED' && (
              <Button color="primary" onClick={() => setRollbackOpen(true)}>
                بازگردانی این نسخه
              </Button>
            )}
            <Link
              to="/merchandising/publications"
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              تاریخچه انتشارها
            </Link>
            <Link
              to="/merchandising/homepage"
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              ویرایشگر صفحه اصلی
            </Link>
          </div>
        }
      />

      {message && (
        <p
          role="status"
          className="rounded-lg bg-success-subtle px-3 py-2 text-sm text-success"
        >
          {message}
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-subtle px-3 py-2 text-sm text-danger"
        >
          {actionError}
        </p>
      )}

      {state.justPublished && publication?.status === 'PUBLISHED' && (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-success-border bg-success-subtle p-4"
        >
          <p className="text-sm font-semibold text-success">
            صفحه اصلی با موفقیت منتشر شد.
          </p>
          <p className="text-sm text-foreground">
            نسخه {publication.version.toLocaleString('fa-IR')} ·{' '}
            {formatTehranDateTime(publication.publishedAt)} · بر پایه پیش‌نویس{' '}
            {publication.sourceDraftRevision.toLocaleString('fa-IR')}
          </p>
        </div>
      )}

      {state.justScheduled && publication?.status === 'SCHEDULED' && (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-info-border bg-info-subtle p-4"
        >
          <p className="text-sm font-semibold text-info">
            انتشار صفحه اصلی زمان‌بندی شد.
          </p>
          <p className="text-sm text-foreground">
            نسخه {publication.version.toLocaleString('fa-IR')} ·{' '}
            {formatTehranDateTime(publication.publishAt)} · بر پایه پیش‌نویس{' '}
            {publication.sourceDraftRevision.toLocaleString('fa-IR')}
          </p>
        </div>
      )}

      {state.justRolledBack && publication?.status === 'PUBLISHED' && (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-info-border bg-info-subtle p-4"
        >
          <p className="text-sm font-semibold text-info">
            نسخه صفحه اصلی با موفقیت بازگردانی شد.
          </p>
          <p className="text-sm text-foreground">
            نسخه جدید {publication.version.toLocaleString('fa-IR')}
            {sourceVersion !== null
              ? ` از نسخه ${sourceVersion.toLocaleString('fa-IR')}`
              : ''}{' '}
            · {formatTehranDateTime(publication.publishedAt)}
          </p>
          {publication.rollbackFromPublicationId && (
            <p className="text-xs text-muted">
              نسخه مبدأ:{' '}
              <span dir="ltr">{publication.rollbackFromPublicationId}</span>
            </p>
          )}
        </div>
      )}

      {revisionMismatch && publication && (
        <div
          role="alert"
          className="space-y-1 rounded-xl border border-warning-border bg-warning-subtle p-4"
        >
          <p className="text-sm font-semibold text-warning">
            نسخه منتشرشده با نسخه تأییدشده شما یکسان نیست.
          </p>
          <p className="text-sm text-foreground">
            انتشار بر پایه پیش‌نویس{' '}
            {publication.sourceDraftRevision.toLocaleString('fa-IR')} انجام شده
            است
            {state.expectedRevision !== undefined
              ? `، در حالی که شما نسخه ${state.expectedRevision.toLocaleString(
                  'fa-IR',
                )} را تأیید کرده بودید`
              : ''}
            . تغییرات محلی شما حفظ شده‌اند و به‌طور خودکار بازنویسی نشدند.
          </p>
        </div>
      )}

      {loading && !publication ? (
        <Loading compact label="در حال بارگذاری جزئیات انتشار…" />
      ) : error && !publication ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !publication ? (
        <EmptyState
          title="نسخه انتشار یافت نشد"
          description="شناسه انتشار را بررسی کنید یا به ویرایشگر صفحه اصلی بازگردید."
          actions={
            <Link
              to="/merchandising/homepage"
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              بازگشت به ویرایشگر
            </Link>
          }
        />
      ) : (
        <>
          {loading && (
            <Text className="text-xs text-muted" role="status">
              در حال به‌روزرسانی جزئیات از سرور…
            </Text>
          )}
          {error && (
            <Text className="text-sm text-danger" role="alert">
              به‌روزرسانی از سرور ممکن نشد؛ داده‌های تأییدشده سرور نمایش داده
              می‌شوند. {error}
            </Text>
          )}

          <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  نسخه {publication.version.toLocaleString('fa-IR')}
                </h2>
                <Text className="text-xs text-muted">
                  شناسه انتشار: <span dir="ltr">{publication.id}</span>
                </Text>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={homepagePublicationStatusTone(publication.status)}
                >
                  {homepagePublicationStatusLabel(publication.status)}
                </StatusBadge>
                <StatusBadge tone="neutral">
                  {publication.sections.length.toLocaleString('fa-IR')} بخش
                </StatusBadge>
              </div>
            </div>

            <p className="rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground">
              {statusExplanation(publication)}
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {publication.publishAt && (
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <p className="text-xs text-muted">زمان زمان‌بندی</p>
                  <p className="text-sm text-foreground">
                    {formatTehranDateTime(publication.publishAt)}
                  </p>
                </div>
              )}
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                <p className="text-xs text-muted">زمان انتشار</p>
                <p className="text-sm text-foreground">
                  {formatTehranDateTime(publication.publishedAt)}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                <p className="text-xs text-muted">پیش‌نویس منبع</p>
                <p className="text-sm tabular-nums text-foreground">
                  {publication.sourceDraftRevision.toLocaleString('fa-IR')}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                <p className="text-xs text-muted">نسخه ساختار</p>
                <p className="text-sm tabular-nums text-foreground">
                  {publication.schemaVersion.toLocaleString('fa-IR')}
                </p>
              </div>
              {publication.rollbackFromPublicationId && (
                <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                  <p className="text-xs text-muted">بازگردانی از</p>
                  <p className="text-sm text-foreground">
                    {sourceVersion !== null
                      ? `نسخه ${sourceVersion.toLocaleString('fa-IR')}`
                      : 'نسخه مبدأ در دسترس نیست'}
                  </p>
                  <p dir="ltr" className="text-xs text-muted">
                    {publication.rollbackFromPublicationId}
                  </p>
                </div>
              )}
            </div>

            {publication.note && (
              <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
                <p className="text-xs text-muted">یادداشت انتشار</p>
                <p className="text-sm text-foreground">{publication.note}</p>
              </div>
            )}

            <Text className="rounded-lg bg-background/60 px-3 py-2 text-xs text-muted">
              این نسخه یک snapshot منتشرشده یا زمان‌بندی‌شده و تغییرناپذیر است.
              این صفحه پیش‌نمایش پیش‌نویس منتشرنشده یا لینک فروشگاه ارائه نمی‌دهد
              و درباره پاک‌سازی فوری cache یا CDN تعهدی نمی‌کند.
            </Text>
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold text-foreground">
              بخش‌های این نسخه
            </h2>
            <ol className="divide-y divide-border rounded-lg border border-border bg-background/40">
              {publication.sections.map((section, index) => (
                <li
                  key={section.key}
                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-semibold tabular-nums text-foreground">
                    {(index + 1).toLocaleString('fa-IR')}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                    {sectionTypeLabel(section.type)}
                  </span>
                  <span dir="ltr" className="text-xs text-muted">
                    {section.key}
                  </span>
                  <StatusBadge tone={section.isVisible ? 'success' : 'neutral'}>
                    {section.isVisible ? 'قابل نمایش' : 'پنهان'}
                  </StatusBadge>
                </li>
              ))}
            </ol>
          </section>

          <HomepagePublicationAuditPanel
            key={`publication-audit-${auditKey}`}
            publicationId={publication.id}
            publication={publication}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              outline
              onClick={() => {
                setAuditKey((value) => value + 1)
                void load()
              }}
              disabled={loading}
            >
              بازخوانی از سرور
            </Button>
            <Link
              to="/merchandising/publications"
              className="focus-ring rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              تاریخچه انتشارها
            </Link>
          </div>
        </>
      )}

      <HomepagePublicationCancelDialog
        open={cancelOpen}
        publication={publication}
        onClose={() => setCancelOpen(false)}
        onCancelled={(updated) => {
          setMessage(
            `انتشار زمان‌بندی‌شده نسخه ${updated.version.toLocaleString(
              'fa-IR',
            )} لغو شد؛ محتوای عمومی فروشگاه تغییر نکرد.`,
          )
          setAuditKey((value) => value + 1)
          void load()
        }}
        onConflict={() => {
          setActionError(
            'وضعیت انتشار تغییر کرده یا نسخه در دسترس نیست؛ جزئیات دوباره از سرور بارگذاری شد. جزئیات تعارض را بررسی کنید و سپس گفت‌وگو را ببندید.',
          )
          setAuditKey((value) => value + 1)
          void load()
        }}
      />

      <HomepagePublicationRollbackDialog
        open={rollbackOpen}
        publication={publication}
        onClose={() => setRollbackOpen(false)}
        onRolledBack={(created, source) => {
          setRollbackOpen(false)
          navigate(`/merchandising/publications/${created.id}`, {
            state: {
              justRolledBack: true,
              publication: created,
              rollbackSourceVersion: source.version,
            },
          })
        }}
        onConflict={() => {
          setActionError(
            'وضعیت انتشار یا اعتبار snapshot مبدأ تغییر کرده است؛ جزئیات دوباره از سرور بارگذاری شد. جزئیات تعارض را بررسی کنید و سپس گفت‌وگو را ببندید.',
          )
          setAuditKey((value) => value + 1)
          void load()
        }}
      />
    </div>
  )
}

export function MerchandisingHomepagePublicationDetailRoute() {
  const { id } = useParams<{ id: string }>()
  return (
    <MerchandisingHomepagePublicationDetailPage key={id ?? 'missing'} />
  )
}
