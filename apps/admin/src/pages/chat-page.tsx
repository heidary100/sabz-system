import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Inbox,
  MessageCircle,
  Search,
  Send,
  UserCheck,
  XCircle,
} from 'lucide-react'
import clsx from 'clsx'
import type {
  AdminChatConversationListItemDto,
  ChatConversationStatus,
} from '@sabz/types'
import { useAdminChat } from '../hooks/use-admin-chat'
import { formatFaNumber } from '../lib/format'
import { storefrontContextUrl } from '../lib/storefront-url'
import { Button } from '../components/catalyst/button'
import { Input } from '../components/catalyst/input'
import { Select } from '../components/catalyst/select'
import { Field, Label } from '../components/catalyst/fieldset'
import { EmptyState } from '../components/ui/empty-state'
import { ErrorState } from '../components/ui/error-state'
import { InlineError } from '../components/ui/inline-error'
import { Loading } from '../components/ui/loading'
import { PageHeader } from '../components/ui/page-header'
import { StatusBadge } from '../components/ui/status-badge'

const STATUS_LABELS: Record<ChatConversationStatus, string> = {
  OPEN: 'باز',
  PENDING: 'در انتظار پاسخ',
  CLOSED: 'بسته‌شده',
}

const STATUS_TONES: Record<ChatConversationStatus, 'success' | 'warning' | 'neutral'> = {
  OPEN: 'success',
  PENDING: 'warning',
  CLOSED: 'neutral',
}

function contextPath(value: string | null): string | null {
  const safe = storefrontContextUrl(value)
  if (!safe) return null
  try {
    const url = new URL(safe)
    return url.pathname + url.search
  } catch {
    return null
  }
}

function contextHref(value: string | null): string | null {
  return storefrontContextUrl(value)
}

function timeFa(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat('fa-IR', {
        calendar: 'persian',
        timeZone: 'Asia/Tehran',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric',
      }).format(date)
}

export function ChatPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialId = searchParams.get('conversation')
  const {
    status,
    assigned,
    searchInput,
    page,
    list,
    selectedId,
    detail,
    loadingList,
    loadingDetail,
    sending,
    error,
    detailError,
    actionError,
    connected,
    setStatus,
    setAssigned,
    setSearchInput,
    setPage,
    select,
    send,
    setConversationStatus,
    assignToMe,
    refreshList,
    refreshDetail,
  } = useAdminChat(initialId)
  const [draft, setDraft] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = searchParams.get('conversation')
    if (id !== selectedId) {
      const next = new URLSearchParams(searchParams)
      if (selectedId) next.set('conversation', selectedId)
      else next.delete('conversation')
      setSearchParams(next, { replace: true })
    }
  }, [selectedId, searchParams, setSearchParams])

  useEffect(() => {
    const node = messagesRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [detail?.messages.length, selectedId])

  const totalPages = useMemo(
    () => (list ? Math.max(1, Math.ceil(list.total / (list.limit || 30))) : 1),
    [list],
  )

  async function handleSend(event: React.FormEvent) {
    event.preventDefault()
    const ok = await send(draft)
    if (ok) setDraft('')
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <PageHeader
        title="گفتگوی پشتیبانی"
        subtitle={
          list
            ? `${formatFaNumber(list.unreadConversations)} گفتگوی خوانده‌نشده — ${formatFaNumber(list.unassigned)} بدون مسئول`
            : 'پیام‌های مشتریان و پاسخ اپراتورها'
        }
        actions={
          <Button outline onClick={() => void refreshList()}>
            <Clock3 className="size-4" aria-hidden="true" />
            تازه‌سازی
          </Button>
        }
      />

      {error && <InlineError message={error} />}
      {actionError && <InlineError message={actionError} />}
      {!connected && (
        <p
          role="status"
          className="rounded-control bg-warning-soft px-3 py-2 text-xs leading-5 text-warning"
        >
          ارتباط زنده قطع است. پیام‌ها در سرور ذخیره می‌شوند؛ برای دیدن
          تازه‌ترین گفتگوها دکمه «تازه‌سازی» را بزنید.
        </p>
      )}

      <div className="grid min-h-[34rem] flex-1 gap-4 lg:h-[calc(100svh-11rem)] lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside
          className={clsx(
            'flex min-h-0 flex-col rounded-card border border-border bg-surface',
            selectedId ? 'hidden lg:flex' : 'flex',
          )}
          aria-label="فهرست گفتگوها"
        >
          <div className="space-y-3 border-b border-border p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted"
                aria-hidden="true"
              />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="جستجوی نام، موبایل یا پیام…"
                className="ps-9"
                aria-label="جستجوی گفتگو"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field className="min-w-0">
                <Label className="sr-only">وضعیت</Label>
                <Select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as ChatConversationStatus | '')
                  }
                >
                  <option value="">همه وضعیت‌ها</option>
                  <option value="PENDING">در انتظار پاسخ</option>
                  <option value="OPEN">باز</option>
                  <option value="CLOSED">بسته‌شده</option>
                </Select>
              </Field>
              <Field className="min-w-0">
                <Label className="sr-only">مسئول</Label>
                <Select
                  value={assigned}
                  onChange={(event) =>
                    setAssigned(event.target.value as 'me' | 'unassigned' | 'all')
                  }
                >
                  <option value="all">همه</option>
                  <option value="me">من</option>
                  <option value="unassigned">بدون مسئول</option>
                </Select>
              </Field>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList && !list ? (
              <div className="p-4">
                <Loading compact label="در حال بارگذاری گفتگوها…" />
              </div>
            ) : !list || list.items.length === 0 ? (
              <div className="p-6 text-center">
                <Inbox className="mx-auto size-7 text-muted" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-foreground">گفتگویی یافت نشد</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  با تغییر فیلترها دوباره تلاش کنید.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.items.map((item) => (
                  <ConversationRow
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    onSelect={() => select(item.id)}
                  />
                ))}
              </ul>
            )}
          </div>
          {list && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded-control px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
              >
                قبلی
              </button>
              <span>
                صفحه {formatFaNumber(page)} از {formatFaNumber(totalPages)}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="rounded-control px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
              >
                بعدی
              </button>
            </div>
          )}
        </aside>

        <section
          className={clsx(
            'flex min-h-0 flex-col rounded-card border border-border bg-surface',
            selectedId ? 'flex' : 'hidden lg:flex',
          )}
          aria-label="گفتگوی انتخاب‌شده"
        >
          {!selectedId ? (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={<MessageCircle className="size-6" aria-hidden="true" />}
                title="یک گفتگو را انتخاب کنید"
                description="پیام‌های مشتری، صفحه فعلی و سابقه مکالمه اینجا نمایش داده می‌شوند."
              />
            </div>
          ) : loadingDetail && !detail ? (
            <div className="p-6">
              <Loading label="در حال بارگذاری گفتگو…" />
            </div>
          ) : detailError ? (
            <div className="p-6">
              <ErrorState
                message={detailError}
                onRetry={() => void refreshDetail(selectedId)}
              />
            </div>
          ) : detail ? (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                <div className="flex min-w-0 items-start gap-2">
                  <button
                    type="button"
                    onClick={() => select(null)}
                    className="mt-0.5 rounded-control p-1 text-muted hover:bg-surface-2 hover:text-foreground lg:hidden"
                    aria-label="بازگشت به فهرست"
                  >
                    <ArrowRight className="size-5" aria-hidden="true" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-foreground">
                      {detail.customer.name ?? detail.customer.mobile}
                    </h2>
                    <p dir="ltr" className="mt-0.5 text-xs text-muted">
                      {detail.customer.mobile}
                    </p>
                    {contextPath(detail.contextUrl) && contextHref(detail.contextUrl) && (
                      <p className="mt-1 max-w-md truncate rounded-control bg-surface-2 px-2 py-1 text-[11px] text-muted">
                        <span className="me-1 text-muted">صفحه فعلی:</span>
                        <a
                          href={contextHref(detail.contextUrl) ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          dir="ltr"
                          className="font-medium text-accent hover:text-accent-hover"
                        >
                          {detail.contextTitle || contextPath(detail.contextUrl)}
                        </a>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={STATUS_TONES[detail.status]}>
                    {STATUS_LABELS[detail.status]}
                  </StatusBadge>
                  <Button outline onClick={() => void assignToMe()}>
                    <UserCheck className="size-4" aria-hidden="true" />
                    مسئولیت من
                  </Button>
                  {detail.status !== 'CLOSED' ? (
                    <Button
                      outline
                      onClick={() => void setConversationStatus('CLOSED')}
                    >
                      <XCircle className="size-4" aria-hidden="true" />
                      بستن
                    </Button>
                  ) : (
                    <Button
                      outline
                      onClick={() => void setConversationStatus('OPEN')}
                    >
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      بازگشایی
                    </Button>
                  )}
                </div>
              </header>

              {actionError && <div className="px-4 pt-3"><InlineError message={actionError} /></div>}

              <div
                ref={messagesRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-2/40 p-4"
                role="log"
                aria-live="polite"
                aria-label="پیام‌های گفتگو"
              >
                {detail.messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted">
                    هنوز پیامی ثبت نشده است.
                  </p>
                ) : (
                  detail.messages.map((message) => {
                    const admin = message.senderType === 'ADMIN'
                    const system = message.senderType === 'SYSTEM'
                    return (
                      <div
                        key={message.id}
                        className={clsx(
                          'flex',
                          system ? 'justify-center' : admin ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={clsx(
                            'max-w-[85%] rounded-card px-3.5 py-2.5 text-sm leading-6 shadow-sm',
                            system
                              ? 'bg-surface text-center text-xs text-muted ring-1 ring-border'
                              : admin
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface text-foreground ring-1 ring-border',
                          )}
                        >
                          {!system && (
                            <p
                              className={clsx(
                                'mb-0.5 text-[10px] font-semibold',
                                admin ? 'text-on-primary/80' : 'text-muted',
                              )}
                            >
                              {admin ? message.senderName ?? 'پشتیبانی' : message.senderName ?? 'مشتری'}
                            </p>
                          )}
                          <p className="whitespace-pre-line break-words">{message.body}</p>
                          <p
                            className={clsx(
                              'mt-1 text-[10px]',
                              admin ? 'text-on-primary/70' : 'text-muted',
                            )}
                          >
                            {timeFa(message.createdAt)}
                          </p>
                          {!admin && !system && contextHref(message.contextUrl) ? (
                            <a
                              href={contextHref(message.contextUrl) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              dir="ltr"
                              className="mt-1 block max-w-52 truncate text-[10px] text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover"
                              title={message.contextTitle ?? message.contextUrl ?? undefined}
                            >
                              {message.contextTitle || contextPath(message.contextUrl)}
                            </a>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              <form onSubmit={handleSend} className="border-t border-border p-3">
                <label htmlFor="chat-reply" className="sr-only">
                  پاسخ به مشتری
                </label>
                <textarea
                  id="chat-reply"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      if (draft.trim() && !sending) {
                        void handleSend(event)
                      }
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  disabled={detail.status === 'CLOSED' || sending}
                  placeholder={
                    detail.status === 'CLOSED'
                      ? 'این گفتگو بسته شده است؛ برای پاسخ آن را بازگشایی کنید.'
                      : 'پاسخ خود را بنویسید… (Enter برای ارسال، Shift+Enter برای خط جدید)'
                  }
                  className="w-full resize-none rounded-control border-0 bg-surface-2 px-3 py-2 text-sm text-foreground ring-1 ring-inset ring-border-control placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {formatFaNumber(draft.length)} / ۴٬۰۰۰
                  </span>
                  <Button
                    type="submit"
                    disabled={
                      sending || draft.trim().length === 0 || detail.status === 'CLOSED'
                    }
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {sending ? 'در حال ارسال…' : 'ارسال پاسخ'}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="p-6">
              <EmptyState title="گفتگو در دسترس نیست" description="گفتگوی دیگری انتخاب کنید." />
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ConversationRow({
  item,
  active,
  onSelect,
}: {
  item: AdminChatConversationListItemDto
  active: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={clsx(
          'w-full px-3 py-3 text-start transition-colors hover:bg-surface-2/70 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          active && 'bg-primary-subtle/60',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {item.unreadForAdmin > 0 && (
                <span
                  className="size-2 shrink-0 rounded-full bg-primary"
                  aria-label="خوانده‌نشده"
                />
              )}
              <p
                className={clsx(
                  'truncate text-sm',
                  item.unreadForAdmin > 0
                    ? 'font-bold text-foreground'
                    : 'font-medium text-foreground/90',
                )}
              >
                {item.customer.name ?? item.customer.mobile}
              </p>
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted">
              {item.lastMessagePreview ?? 'بدون پیام'}
            </p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-[10px] text-muted">{timeFa(item.lastMessageAt)}</p>
            <div className="mt-1 flex justify-end">
              <StatusBadge tone={STATUS_TONES[item.status]}>
                {STATUS_LABELS[item.status]}
              </StatusBadge>
            </div>
          </div>
        </div>
        {item.unreadForAdmin > 0 && (
          <span className="mt-1.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-[10px] font-bold leading-5 text-on-primary">
            {formatFaNumber(item.unreadForAdmin)}
          </span>
        )}
      </button>
    </li>
  )
}
