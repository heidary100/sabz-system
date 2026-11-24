import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AdminChatConversationDto,
  AdminChatConversationListResponse,
  ChatConversationStatus,
  SendChatMessageInput,
} from '@sabz/types'
import { useAuth } from '../auth/auth-provider'
import { useNotificationCenter } from '../components/notifications/notification-center-provider'
import { translateApiError } from '../lib/error-messages'
import {
  getAdminConversation,
  listAdminConversations,
  markAdminConversationRead,
  sendAdminMessage,
  updateAdminConversation,
} from '../services/chat'

const DEFAULT_LIMIT = 30
const SEARCH_DEBOUNCE_MS = 300

export function useAdminChat(initialConversationId: string | null) {
  const { chatVersion, connected } = useNotificationCenter()
  const { user } = useAuth()
  const [status, setStatus] = useState<ChatConversationStatus | ''>('')
  const [assigned, setAssigned] = useState<'me' | 'unassigned' | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [list, setList] = useState<AdminChatConversationListResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId)
  const [detail, setDetail] = useState<AdminChatConversationDto | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const listSeq = useRef(0)
  const detailSeq = useRef(0)
  const selectedIdRef = useRef(selectedId)
  // Keep one idempotency key per conversation/body until the server confirms.
  const pendingSend = useRef<{
    conversationId: string
    body: string
    id: string
  } | null>(null)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const refreshList = useCallback(async () => {
    const seq = ++listSeq.current
    setLoadingList(true)
    setError(null)
    try {
      const next = await listAdminConversations({
        status: status || undefined,
        assigned,
        search: search || undefined,
        page,
        limit: DEFAULT_LIMIT,
      })
      if (seq === listSeq.current) {
        setList(next)
      }
    } catch (loadError) {
      if (seq === listSeq.current) {
        setError(translateApiError(loadError))
      }
    } finally {
      if (seq === listSeq.current) {
        setLoadingList(false)
      }
    }
  }, [status, assigned, search, page])

  const refreshDetail = useCallback(async (id: string) => {
    const seq = ++detailSeq.current
    setLoadingDetail(true)
    setDetailError(null)
    try {
      const next = await getAdminConversation(id)
      if (seq === detailSeq.current) {
        setDetail(next)
        if (next.unreadForAdmin > 0) {
          await markAdminConversationRead(id)
        }
      }
    } catch (loadError) {
      if (seq === detailSeq.current) {
        setDetailError(translateApiError(loadError))
      }
    } finally {
      if (seq === detailSeq.current) {
        setLoadingDetail(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshList()
  }, [refreshList, chatVersion])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    void refreshDetail(selectedId)
  }, [selectedId, refreshDetail, chatVersion])

  const select = useCallback((id: string | null) => {
    selectedIdRef.current = id
    setSelectedId(id)
    setActionError(null)
  }, [])

  const send = useCallback(
    async (body: string): Promise<boolean> => {
      if (!selectedId || body.trim().length === 0) {
        return false
      }
      const targetId = selectedId
      setSending(true)
      setActionError(null)
      const pending = pendingSend.current
      const clientMessageId =
        pending !== null &&
        pending.conversationId === targetId &&
        pending.body === body
          ? pending.id
          : crypto.randomUUID()
      pendingSend.current = { conversationId: targetId, body, id: clientMessageId }
      const input: SendChatMessageInput = {
        body,
        clientMessageId,
      }
      try {
        const next = await sendAdminMessage(targetId, input)
        pendingSend.current = null
        if (selectedIdRef.current === targetId) {
          setDetail(next)
        }
        await refreshList()
        return true
      } catch (sendError) {
        if (selectedIdRef.current === targetId) {
          setActionError(translateApiError(sendError))
        }
        return false
      } finally {
        setSending(false)
      }
    },
    [selectedId, refreshList],
  )

  const setConversationStatus = useCallback(
    async (nextStatus: ChatConversationStatus) => {
      if (!selectedId) return
      const targetId = selectedId
      setActionError(null)
      try {
        const next = await updateAdminConversation(targetId, { status: nextStatus })
        if (selectedIdRef.current === targetId) {
          setDetail(next)
        }
        await refreshList()
      } catch (updateError) {
        if (selectedIdRef.current === targetId) {
          setActionError(translateApiError(updateError))
        }
      }
    },
    [selectedId, refreshList],
  )

  const assignToMe = useCallback(async () => {
    if (!selectedId || !user) return
    const targetId = selectedId
    setActionError(null)
    try {
      const next = await updateAdminConversation(targetId, {
        assignedToId: user.id,
      })
      if (selectedIdRef.current === targetId) {
        setDetail(next)
      }
      await refreshList()
    } catch (updateError) {
      if (selectedIdRef.current === targetId) {
        setActionError(translateApiError(updateError))
      }
    }
  }, [selectedId, user, refreshList])

  return {
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
    setStatus: (value: ChatConversationStatus | '') => {
      setStatus(value)
      setPage(1)
    },
    setAssigned: (value: 'me' | 'unassigned' | 'all') => {
      setAssigned(value)
      setPage(1)
    },
    setSearchInput,
    setPage,
    select,
    send,
    setConversationStatus,
    assignToMe,
    refreshList,
    refreshDetail,
  }
}
