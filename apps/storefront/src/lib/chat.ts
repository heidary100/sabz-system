import type {
  ChatMessageDto,
  ChatReadResponse,
  CustomerChatConversationDto,
  CustomerChatStateDto,
  SendChatMessageInput,
} from '@sabz/types';
import { authFetch } from './auth-client';
import { ApiError } from './api';

const LOAD_FAILED = 'دریافت گفتگو ناموفق بود؛ دوباره تلاش کنید.';
const SEND_FAILED = 'ارسال پیام ناموفق بود؛ دوباره تلاش کنید.';

async function parse<T>(response: Response, fallback: string): Promise<T> {
  if (response.status === 401) {
    throw new ApiError(401, {
      statusCode: 401,
      message: 'برای گفتگو با پشتیبانی وارد شوید.',
      error: 'Unauthorized',
    });
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { message?: unknown }
      | undefined;
    const message =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message) && typeof body.message[0] === 'string'
          ? body.message[0]
          : fallback;
    throw new ApiError(response.status, {
      statusCode: response.status,
      message,
      error: fallback,
    });
  }
  return (await response.json()) as T;
}

export async function fetchChatState(): Promise<CustomerChatStateDto> {
  const response = await authFetch('/chat/conversation', { cache: 'no-store' });
  return parse<CustomerChatStateDto>(response, LOAD_FAILED);
}

export async function openChatConversation(
  contextUrl: string,
): Promise<CustomerChatConversationDto> {
  const response = await authFetch('/chat/conversation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contextUrl }),
  });
  return parse<CustomerChatConversationDto>(response, LOAD_FAILED);
}

export async function sendChatMessage(
  input: SendChatMessageInput,
): Promise<CustomerChatConversationDto> {
  const response = await authFetch('/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parse<CustomerChatConversationDto>(response, SEND_FAILED);
}

export async function markChatRead(): Promise<ChatReadResponse> {
  const response = await authFetch('/chat/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return parse<ChatReadResponse>(response, LOAD_FAILED);
}

export async function closeChatConversation(): Promise<{ closed: true }> {
  const response = await authFetch('/chat/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  return parse<{ closed: true }>(response, LOAD_FAILED);
}

export function lastMessagePreview(conversation: CustomerChatConversationDto): ChatMessageDto | null {
  return conversation.messages.at(-1) ?? null;
}
