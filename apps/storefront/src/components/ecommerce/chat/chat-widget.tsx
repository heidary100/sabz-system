'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useHasSession } from '@/components/ecommerce/wishlist/use-has-session';
import { useStoreNotifications } from '@/components/ecommerce/notifications/notification-provider';
import type { CustomerChatConversationDto } from '@sabz/types';
import {
  fetchChatState,
  markChatRead,
  openChatConversation,
  sendChatMessage,
} from '@/lib/chat';
import { ApiError } from '@/lib/api';
import { formatFaDateTime } from '@/lib/format';

function currentContext(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href.slice(0, 2048);
}

/**
 * Floating customer support chat (SS-900). The widget sends the current page
 * URL as display context and never shares cursor/mouse position. Messages are
 * plain text; history is persisted server-side and reconciled on reconnect.
 */
export function ChatWidget() {
  const visible = useHasSession();
  const { chatVersion } = useStoreNotifications();
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<CustomerChatConversationDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (options: { start?: boolean } = {}) => {
    setLoading(true);
    setError(null);
    try {
      const state = await fetchChatState();
      let next = state.conversation;
      if (!next && options.start) {
        next = await openChatConversation(currentContext());
      }
      setConversation(next);
      if (next && next.unreadForCustomer > 0) {
        await markChatRead();
      }
    } catch (loadError) {
      setError(
        loadError instanceof ApiError
          ? (loadError.payload?.message ?? 'دریافت گفتگو ناموفق بود.')
          : 'دریافت گفتگو ناموفق بود.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset session-scoped widget state on logout
      setOpen(false);
      setConversation(null);
      return;
    }
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load persisted chat state when the panel opens
    void load();
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reconcile new chat messages while the panel is open
    void load();
  }, [open, load, chatVersion]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [conversation?.messages.length, open]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const next = await sendChatMessage({
        body: draft,
        clientMessageId: crypto.randomUUID(),
        contextUrl: currentContext(),
      });
      setConversation(next);
      setDraft('');
    } catch (sendError) {
      setError(
        sendError instanceof ApiError
          ? (sendError.payload?.message ?? 'ارسال پیام ناموفق بود.')
          : 'ارسال پیام ناموفق بود.',
      );
    } finally {
      setSending(false);
    }
  }

  if (!visible) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="گفتگو با پشتیبانی"
          className="fixed bottom-5 end-4 z-50 flex min-h-12 items-center gap-2 rounded-pill bg-accent px-4 text-sm font-semibold text-on-accent shadow-lg transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:end-6"
        >
          <span className="relative flex size-6 items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
              <path d="M8.625 9.75h6.75m-6.75 3h4.5m-9.75 6 2.25-3.375a8.25 8.25 0 1 1 5.25 1.875c-1.275 0-2.49-.29-3.57-.81L3 18.75Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {conversation && conversation.unreadForCustomer > 0 && (
              <span className="absolute -start-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-sale px-1 text-[10px] font-bold text-on-sale">
                {conversation.unreadForCustomer}
              </span>
            )}
          </span>
          پشتیبانی
        </button>
      )}

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-label="گفتگو با پشتیبانی"
          className="fixed inset-x-3 bottom-4 z-50 flex h-[min(34rem,78vh)] flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-2xl sm:inset-x-auto sm:end-6 sm:w-[24rem]"
        >
          <header className="flex items-start justify-between gap-2 border-b border-border bg-surface-2/60 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-fg">پشتیبانی سبز سیستم</p>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                پاسخ اپراتورها در همین صفحه و مرکز اعلان‌ها می‌آید.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="بستن گفتگو"
              className="rounded-control p-1 text-fg-muted hover:bg-surface hover:text-fg"
            >
              ×
            </button>
          </header>

          {error && (
            <p role="alert" className="mx-3 mt-2 rounded-control bg-danger-soft px-2.5 py-1.5 text-xs text-danger">
              {error}
            </p>
          )}

          {loading && !conversation ? (
            <div className="flex flex-1 items-center justify-center text-sm text-fg-muted" aria-busy="true">
              در حال اتصال…
            </div>
          ) : !conversation ? (
            <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
              <p className="text-sm font-semibold text-fg">به کمک نیاز دارید؟</p>
              <p className="mt-1 text-xs leading-5 text-fg-secondary">
                گفتگو را شروع کنید تا تیم پشتیبانی در جریان صفحه فعلی شما قرار بگیرد.
              </p>
              <button
                type="button"
                onClick={() => void load({ start: true })}
                className="mt-4 min-h-10 rounded-pill bg-accent px-4 text-sm font-semibold text-on-accent"
              >
                شروع گفتگو
              </button>
            </div>
          ) : (
            <>
              <div
                ref={listRef}
                role="log"
                aria-live="polite"
                className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-surface-2/30 p-3"
              >
                {conversation.messages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-fg-muted">هنوز پیامی نیست.</p>
                ) : (
                  conversation.messages.map((message) => {
                    const admin = message.senderType === 'ADMIN';
                    const system = message.senderType === 'SYSTEM';
                    return (
                      <div key={message.id} className={system ? 'text-center' : admin ? 'flex justify-start' : 'flex justify-end'}>
                        <div
                          className={
                            system
                              ? 'mx-auto max-w-[90%] rounded-control bg-surface px-2.5 py-1.5 text-[11px] text-fg-muted ring-1 ring-border'
                              : admin
                                ? 'max-w-[85%] rounded-panel rounded-ss-sm bg-surface px-3 py-2 text-sm leading-6 text-fg ring-1 ring-border'
                                : 'max-w-[85%] rounded-panel rounded-se-sm bg-accent px-3 py-2 text-sm leading-6 text-on-accent'
                          }
                        >
                          {!system && (
                            <p className={`mb-0.5 text-[10px] ${admin ? 'text-fg-muted' : 'text-on-accent/75'}`}>
                              {admin ? 'پشتیبانی' : 'شما'}
                            </p>
                          )}
                          <p className="whitespace-pre-line break-words">{message.body}</p>
                          <p className={`mt-0.5 text-[10px] ${admin ? 'text-fg-muted' : 'text-on-accent/70'}`}>
                            {formatFaDateTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {conversation.contextUrl && (
                <p className="border-t border-border px-3 py-1.5 text-[10px] text-fg-muted" dir="ltr">
                  {conversation.contextUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}
                </p>
              )}

              <form onSubmit={send} className="border-t border-border p-2.5">
                <label htmlFor="store-chat-message" className="sr-only">
                  پیام به پشتیبانی
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    id="store-chat-message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        if (draft.trim() && !sending) void send(event);
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    disabled={sending}
                    placeholder="پیام خود را بنویسید…"
                    className="min-h-10 flex-1 resize-none rounded-control border-0 bg-surface-2 px-3 py-2 text-sm text-fg ring-1 ring-inset ring-border-control placeholder:text-fg-muted focus-visible:ring-2 focus-visible:ring-focus"
                  />
                  <button
                    type="submit"
                    disabled={sending || draft.trim().length === 0}
                    aria-label="ارسال پیام"
                    className="flex min-h-10 min-w-10 items-center justify-center rounded-control bg-accent text-on-accent disabled:opacity-40"
                  >
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor" aria-hidden="true" className="size-5">
                      <path d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L6 12Zm0 0h7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-fg-muted">
                  <span>صفحه فعلی به‌عنوان زمینه ارسال می‌شود.</span>
                  <Link href="/notifications" className="hover:text-accent hover:underline">
                    اعلان‌ها
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
