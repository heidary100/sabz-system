/**
 * Customer support chat (SS-900). Plain text only; the current page URL is
 * optional display context. No cursor, mouse position, or live location is
 * ever collected.
 */

export type ChatConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED';
export type ChatSenderType = 'CUSTOMER' | 'ADMIN' | 'SYSTEM';

export const CHAT_STATUS_FA: Record<ChatConversationStatus, string> = {
  OPEN: 'باز',
  PENDING: 'در انتظار پاسخ',
  CLOSED: 'بسته‌شده',
};

export interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderType: ChatSenderType;
  senderName: string | null;
  body: string;
  contextUrl: string | null;
  contextTitle: string | null;
  contextKind: string | null;
  contextLabel: string | null;
  createdAt: string;
}

export interface CustomerChatConversationDto {
  id: string;
  status: ChatConversationStatus;
  statusFa: string;
  contextUrl: string | null;
  contextTitle: string | null;
  contextKind: string | null;
  contextLabel: string | null;
  contextUpdatedAt: string | null;
  unreadForCustomer: number;
  lastMessageAt: string;
  messages: ChatMessageDto[];
  /** Last page URL sent with the conversation, for context display. */
  createdAt: string;
}

export interface CustomerChatStateDto {
  conversation: CustomerChatConversationDto | null;
  /** Server-side anti-spam window, for the composer hint. */
  canSend: boolean;
}

export interface AdminChatConversationListItemDto {
  id: string;
  status: ChatConversationStatus;
  statusFa: string;
  customer: {
    id: string;
    mobile: string;
    name: string | null;
  };
  assignedTo: { id: string; mobile: string } | null;
  contextUrl: string | null;
  contextTitle: string | null;
  contextKind: string | null;
  contextLabel: string | null;
  contextUpdatedAt: string | null;
  unreadForAdmin: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  createdAt: string;
}

export interface AdminChatConversationListResponse {
  items: AdminChatConversationListItemDto[];
  total: number;
  page: number;
  limit: number;
  unassigned: number;
  unreadConversations: number;
}

export interface AdminChatConversationDto extends CustomerChatConversationDto {
  customer: {
    id: string;
    mobile: string;
    name: string | null;
  };
  assignedTo: { id: string; mobile: string } | null;
  unreadForAdmin: number;
}

export interface SendChatMessageInput {
  body: string;
  clientMessageId?: string;
  /** Storefront page URL, validated/sanitized server-side. */
  contextUrl?: string;
  contextTitle?: string;
  contextKind?: string;
  contextLabel?: string;
}

export interface OpenChatConversationInput {
  contextUrl?: string;
  contextTitle?: string;
  contextKind?: string;
  contextLabel?: string;
  subject?: string;
}

export interface UpdateChatContextInput {
  contextUrl?: string;
  contextTitle?: string;
  contextKind?: string;
  contextLabel?: string;
}

export interface ChatReadResponse {
  conversationId: string;
  unreadForCustomer: number;
  unreadForAdmin: number;
}

export interface UpdateChatConversationInput {
  status?: ChatConversationStatus;
  assignedToId?: string | null;
}

export interface ChatConversationListQuery {
  status?: ChatConversationStatus;
  assigned?: 'me' | 'unassigned' | 'all';
  search?: string;
  page?: number;
  limit?: number;
}
