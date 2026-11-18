import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ChatConversationStatus, ChatSenderType, Prisma } from '@prisma/client';
import {
  CHAT_STATUS_FA,
  type AdminChatConversationDto,
  type AdminChatConversationListItemDto,
  type AdminChatConversationListResponse,
  type ChatMessageDto,
  type ChatReadResponse,
  type CustomerChatConversationDto,
  type CustomerChatStateDto,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { RealtimeService } from '../realtime/realtime.service';
import type {
  ListAdminChatQueryDto,
  ListChatMessagesQueryDto,
  OpenChatConversationDto,
  SendChatMessageDto,
  UpdateChatConversationDto,
} from './dto/chat.dto';

const MAX_BODY = 4000;
const MAX_CONTEXT = 2048;
const DEFAULT_PAGE_SIZE = 30;
const CUSTOMER_RATE_WINDOW_MS = 60_000;
const CUSTOMER_RATE_LIMIT = 20;

const conversationSelect = {
  id: true,
  userId: true,
  status: true,
  assignedToId: true,
  subject: true,
  contextUrl: true,
  lastMessageAt: true,
  lastCustomerMessageAt: true,
  lastAdminMessageAt: true,
  unreadForAdmin: true,
  unreadForCustomer: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      mobile: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  },
  assignedTo: { select: { id: true, mobile: true } },
  messages: {
    select: {
      id: true,
      conversationId: true,
      senderType: true,
      senderUserId: true,
      body: true,
      contextUrl: true,
      createdAt: true,
      sender: {
        select: {
          mobile: true,
          profile: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 100,
  },
} satisfies Prisma.ChatConversationSelect;

type ConversationRow = Prisma.ChatConversationGetPayload<{
  select: typeof conversationSelect;
}>;

/**
 * Customer ↔ admin support chat (SS-900).
 *
 * Persistence is authoritative; Socket.IO is delivery only. Customer access
 * is scoped to the owned conversation, admin access requires OPERATOR/ADMIN
 * at the controller. Message bodies are plain text (never HTML); context is
 * a sanitized URL only — no cursor/location sharing exists.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimeService,
  ) {}

  async customerState(userId: string): Promise<CustomerChatStateDto> {
    const row = await this.findOpen(userId);
    return {
      conversation: row ? this.toCustomerDto(row) : null,
      canSend: true,
    };
  }

  async open(
    userId: string,
    input: OpenChatConversationDto,
  ): Promise<CustomerChatConversationDto> {
    const contextUrl = sanitizeContextUrl(input.contextUrl);
    const subject = cleanOptionalText(input.subject, 200);
    const existing = await this.findOpen(userId);
    if (existing) {
      if (contextUrl || subject) {
        const updated = await this.prisma.chatConversation.update({
          where: { id: existing.id },
          data: {
            ...(contextUrl ? { contextUrl } : {}),
            ...(subject ? { subject } : {}),
          },
          select: conversationSelect,
        });
        return this.toCustomerDto(updated);
      }
      return this.toCustomerDto(existing);
    }
    try {
      const created = await this.prisma.chatConversation.create({
        data: {
          userId,
          status: ChatConversationStatus.OPEN,
          contextUrl,
          subject,
          messages: {
            create: {
              senderType: ChatSenderType.SYSTEM,
              body: 'گفتگو آغاز شد. تیم پشتیبانی به‌زودی پاسخ می‌دهد.',
            },
          },
        },
        select: conversationSelect,
      });
      return this.toCustomerDto(created);
    } catch (error) {
      // Partial unique index race: reuse the winner's open conversation.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const winner = await this.findOpen(userId);
        if (winner) {
          return this.toCustomerDto(winner);
        }
      }
      throw error;
    }
  }

  async customerMessages(
    userId: string,
    query: ListChatMessagesQueryDto,
  ): Promise<{ items: ChatMessageDto[]; hasMore: boolean }> {
    const conversation = await this.findOpen(userId);
    if (!conversation) {
      return { items: [], hasMore: false };
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const before = parseBefore(query.before);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      select: messageSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    return {
      items: rows
        .slice(0, limit)
        .reverse()
        .map((row) => this.toMessageDto(row)),
      hasMore,
    };
  }

  async sendCustomer(
    userId: string,
    input: SendChatMessageDto,
  ): Promise<CustomerChatConversationDto> {
    const body = cleanBody(input.body);
    const contextUrl = sanitizeContextUrl(input.contextUrl);
    await this.enforceCustomerRate(userId);
    let conversation = await this.findOpen(userId);
    if (!conversation) {
      await this.open(userId, { contextUrl: contextUrl ?? undefined });
      conversation = await this.findOpen(userId);
    }
    if (!conversation) {
      throw new ConflictOpenException();
    }
    const clientMessageId = cleanOptionalText(input.clientMessageId, 100);
    if (clientMessageId) {
      const existing = await this.prisma.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: conversation.id,
            clientMessageId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        const current = await this.findOpen(userId);
        return this.toCustomerDto(current!);
      }
    }
    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          senderType: ChatSenderType.CUSTOMER,
          senderUserId: userId,
          body,
          contextUrl: contextUrl ?? conversation.contextUrl,
          clientMessageId,
        },
      }),
      this.prisma.chatConversation.update({
        where: { id: conversation.id },
        data: {
          status: ChatConversationStatus.PENDING,
          unreadForAdmin: { increment: 1 },
          lastMessageAt: new Date(),
          lastCustomerMessageAt: new Date(),
          contextUrl: contextUrl ?? conversation.contextUrl,
        },
      }),
    ]);
    const updated = await this.findOpen(userId);
    if (updated) {
      const latest = updated.messages[0];
      if (latest) {
        this.realtime.emitToRole('OPERATOR', 'chat:message', {
          conversationId: updated.id,
          message: this.toMessageDto(latest),
          unreadForCustomer: updated.unreadForCustomer,
          unreadForAdmin: updated.unreadForAdmin,
          customerUserId: userId,
        });
        this.realtime.emitToRole('ADMIN', 'chat:message', {
          conversationId: updated.id,
          message: this.toMessageDto(latest),
          unreadForCustomer: updated.unreadForCustomer,
          unreadForAdmin: updated.unreadForAdmin,
          customerUserId: userId,
        });
      }
    }
    await this.notifications.notifyOperators({
      type: 'CHAT_MESSAGE',
      title: 'پیام پشتیبانی جدید',
      body: `${this.customerName(updated ?? conversation)}: ${truncate(body, 90)}`,
      entity: 'ChatConversation',
      entityId: conversation.id,
      priority: 'HIGH',
      category: 'CHAT',
    });
    return this.toCustomerDto(updated!);
  }

  async markCustomerRead(userId: string): Promise<ChatReadResponse> {
    const conversation = await this.findOpen(userId);
    if (!conversation) {
      throw new NotFoundException('گفتگوی فعالی یافت نشد.');
    }
    const updated = await this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: { unreadForCustomer: 0 },
      select: { id: true, unreadForCustomer: true, unreadForAdmin: true },
    });
    this.realtime.emitToUser(userId, 'chat:read', {
      conversationId: updated.id,
      unreadForCustomer: 0,
    });
    return {
      conversationId: updated.id,
      unreadForCustomer: updated.unreadForCustomer,
      unreadForAdmin: updated.unreadForAdmin,
    };
  }

  async closeCustomer(userId: string): Promise<{ closed: true }> {
    const conversation = await this.findOpen(userId);
    if (!conversation) {
      throw new NotFoundException('گفتگوی فعالی یافت نشد.');
    }
    await this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        status: ChatConversationStatus.CLOSED,
        closedAt: new Date(),
      },
    });
    this.realtime.emitToRole('OPERATOR', 'chat:closed', {
      conversationId: conversation.id,
    });
    this.realtime.emitToRole('ADMIN', 'chat:closed', {
      conversationId: conversation.id,
    });
    return { closed: true };
  }

  // ---------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------

  async adminList(
    adminUserId: string,
    query: ListAdminChatQueryDto,
  ): Promise<AdminChatConversationListResponse> {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const limit = Math.min(Math.max(Math.trunc(query.limit ?? DEFAULT_PAGE_SIZE), 1), 100);
    const where: Prisma.ChatConversationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigned === 'me' ? { assignedToId: adminUserId } : {}),
      ...(query.assigned === 'unassigned' ? { assignedToId: null } : {}),
      ...(query.search
        ? {
            OR: [
              { user: { mobile: { contains: query.search } } },
              { user: { profile: { firstName: { contains: query.search } } } },
              { user: { profile: { lastName: { contains: query.search } } } },
              { messages: { some: { body: { contains: query.search } } } },
            ],
          }
        : {}),
    };
    const [total, rows, unassigned, unreadConversations] = await this.prisma.$transaction([
      this.prisma.chatConversation.count({ where }),
      this.prisma.chatConversation.findMany({
        where,
        select: {
          id: true,
          status: true,
          contextUrl: true,
          unreadForAdmin: true,
          lastMessageAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              mobile: true,
              profile: { select: { firstName: true, lastName: true } },
            },
          },
          assignedTo: { select: { id: true, mobile: true } },
          messages: {
            select: { body: true },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatConversation.count({
        where: { status: { not: ChatConversationStatus.CLOSED }, assignedToId: null },
      }),
      this.prisma.chatConversation.count({
        where: { status: { not: ChatConversationStatus.CLOSED }, unreadForAdmin: { gt: 0 } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toAdminListItem(row)),
      total,
      page,
      limit,
      unassigned,
      unreadConversations,
    };
  }

  async adminDetail(conversationId: string): Promise<AdminChatConversationDto> {
    const row = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: conversationSelect,
    });
    if (!row) {
      throw new NotFoundException('گفتگو یافت نشد.');
    }
    return {
      ...this.toCustomerDto(row),
      customer: {
        id: row.userId,
        mobile: row.user.mobile,
        name: this.customerName(row),
      },
      assignedTo: row.assignedTo,
      unreadForAdmin: row.unreadForAdmin,
    };
  }

  async sendAdmin(
    adminUserId: string,
    conversationId: string,
    input: SendChatMessageDto,
  ): Promise<AdminChatConversationDto> {
    const body = cleanBody(input.body);
    const contextUrl = sanitizeContextUrl(input.contextUrl);
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, status: true, contextUrl: true },
    });
    if (!conversation) {
      throw new NotFoundException('گفتگو یافت نشد.');
    }
    if (conversation.status === ChatConversationStatus.CLOSED) {
      throw new BadRequestException('این گفتگو بسته شده است.');
    }
    const clientMessageId = cleanOptionalText(input.clientMessageId, 100);
    if (clientMessageId) {
      const existing = await this.prisma.chatMessage.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId,
            clientMessageId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        return this.adminDetail(conversationId);
      }
    }
    await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId,
          senderType: ChatSenderType.ADMIN,
          senderUserId: adminUserId,
          body,
          contextUrl,
          clientMessageId,
        },
      }),
      this.prisma.chatConversation.update({
        where: { id: conversationId },
        data: {
          assignedToId: adminUserId,
          unreadForCustomer: { increment: 1 },
          lastMessageAt: new Date(),
          lastAdminMessageAt: new Date(),
          status: ChatConversationStatus.OPEN,
        },
      }),
    ]);
    const updated = await this.adminDetail(conversationId);
    const latest = updated.messages.at(-1);
    if (latest) {
      this.realtime.emitToUser(conversation.userId, 'chat:message', {
        conversationId,
        message: latest,
        unreadForCustomer: updated.unreadForCustomer,
        unreadForAdmin: updated.unreadForAdmin,
        customerUserId: conversation.userId,
      });
      this.realtime.emitToRole('OPERATOR', 'chat:message', {
        conversationId,
        message: latest,
        unreadForCustomer: updated.unreadForCustomer,
        unreadForAdmin: updated.unreadForAdmin,
        customerUserId: conversation.userId,
      });
      this.realtime.emitToRole('ADMIN', 'chat:message', {
        conversationId,
        message: latest,
        unreadForCustomer: updated.unreadForCustomer,
        unreadForAdmin: updated.unreadForAdmin,
        customerUserId: conversation.userId,
      });
    }
    await this.notifications.notify(conversation.userId, {
      type: 'CHAT_REPLY',
      title: 'پاسخ پشتیبانی',
      body: truncate(body, 120),
      entity: 'ChatConversation',
      entityId: conversationId,
      priority: 'HIGH',
      category: 'CHAT',
    });
    return updated;
  }

  async markAdminRead(
    adminUserId: string,
    conversationId: string,
  ): Promise<ChatReadResponse> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true },
    });
    if (!conversation) {
      throw new NotFoundException('گفتگو یافت نشد.');
    }
    const updated = await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: { unreadForAdmin: 0 },
      select: { id: true, unreadForCustomer: true, unreadForAdmin: true },
    });
    this.realtime.emitToUser(conversation.userId, 'chat:read', {
      conversationId,
      unreadForAdmin: 0,
    });
    this.realtime.emitToRole('OPERATOR', 'chat:read', {
      conversationId,
      unreadForAdmin: 0,
      byAdminId: adminUserId,
    });
    this.realtime.emitToRole('ADMIN', 'chat:read', {
      conversationId,
      unreadForAdmin: 0,
      byAdminId: adminUserId,
    });
    return {
      conversationId: updated.id,
      unreadForCustomer: updated.unreadForCustomer,
      unreadForAdmin: updated.unreadForAdmin,
    };
  }

  async updateConversation(
    conversationId: string,
    input: UpdateChatConversationDto,
    adminUserId: string,
  ): Promise<AdminChatConversationDto> {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, status: true },
    });
    if (!conversation) {
      throw new NotFoundException('گفتگو یافت نشد.');
    }
    if (input.assignedToId !== undefined && input.assignedToId !== null) {
      const admin = await this.prisma.user.findFirst({
        where: {
          id: input.assignedToId,
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { role: { name: { in: ['OPERATOR', 'ADMIN'] } } } },
        },
        select: { id: true },
      });
      if (!admin) {
        throw new BadRequestException('مسئول انتخاب‌شده دارای دسترسی پشتیبانی نیست.');
      }
    }
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        ...(input.status !== undefined
          ? {
              status: input.status,
              closedAt:
                input.status === ChatConversationStatus.CLOSED
                  ? new Date()
                  : null,
            }
          : {}),
        ...(input.assignedToId !== undefined
          ? {
              assignedToId:
                input.assignedToId === null ? null : (input.assignedToId ?? adminUserId),
            }
          : {}),
      },
    });
    return this.adminDetail(conversationId);
  }

  // ---------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------

  private async findOpen(userId: string): Promise<ConversationRow | null> {
    return this.prisma.chatConversation.findFirst({
      where: {
        userId,
        status: { not: ChatConversationStatus.CLOSED },
      },
      select: conversationSelect,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
  }

  private async enforceCustomerRate(userId: string): Promise<void> {
    const since = new Date(Date.now() - CUSTOMER_RATE_WINDOW_MS);
    const count = await this.prisma.chatMessage.count({
      where: {
        senderUserId: userId,
        senderType: ChatSenderType.CUSTOMER,
        createdAt: { gte: since },
      },
    });
    if (count >= CUSTOMER_RATE_LIMIT) {
      throw new UnprocessableEntityException(
        'تعداد پیام‌های شما بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.',
      );
    }
  }

  private toCustomerDto(row: ConversationRow): CustomerChatConversationDto {
    const messages = [...row.messages]
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((message) => this.toMessageDto(message));
    return {
      id: row.id,
      status: row.status,
      statusFa: CHAT_STATUS_FA[row.status],
      contextUrl: row.contextUrl,
      unreadForCustomer: row.unreadForCustomer,
      lastMessageAt: row.lastMessageAt.toISOString(),
      messages,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toAdminListItem(row: {
    id: string;
    status: ChatConversationStatus;
    contextUrl: string | null;
    unreadForAdmin: number;
    lastMessageAt: Date;
    createdAt: Date;
    user: {
      id: string;
      mobile: string;
      profile: { firstName: string; lastName: string } | null;
    };
    assignedTo: { id: string; mobile: string } | null;
    messages: Array<{ body: string }>;
  }): AdminChatConversationListItemDto {
    const name = row.user.profile
      ? `${row.user.profile.firstName} ${row.user.profile.lastName}`.trim()
      : null;
    return {
      id: row.id,
      status: row.status,
      statusFa: CHAT_STATUS_FA[row.status],
      customer: {
        id: row.user.id,
        mobile: row.user.mobile,
        name: name && name.length > 0 ? name : null,
      },
      assignedTo: row.assignedTo,
      contextUrl: row.contextUrl,
      unreadForAdmin: row.unreadForAdmin,
      lastMessageAt: row.lastMessageAt.toISOString(),
      lastMessagePreview: row.messages[0]
        ? truncate(row.messages[0].body, 100)
        : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toMessageDto(row: {
    id: string;
    conversationId: string;
    senderType: ChatSenderType;
    senderUserId: string | null;
    body: string;
    contextUrl: string | null;
    createdAt: Date;
    sender: {
      mobile: string;
      profile: { firstName: string; lastName: string } | null;
    } | null;
  }): ChatMessageDto {
    let senderName: string | null = null;
    if (row.senderType === ChatSenderType.ADMIN) {
      senderName = 'پشتیبانی سبز سیستم';
    } else if (row.senderType === ChatSenderType.CUSTOMER) {
      const profile = row.sender?.profile;
      senderName =
        profile && `${profile.firstName} ${profile.lastName}`.trim().length > 0
          ? `${profile.firstName} ${profile.lastName}`.trim()
          : null;
    } else {
      senderName = 'سیستم';
    }
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderType: row.senderType,
      senderName,
      body: row.body,
      contextUrl: row.contextUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private customerName(row: ConversationRow): string {
    const name = row.user.profile
      ? `${row.user.profile.firstName} ${row.user.profile.lastName}`.trim()
      : '';
    return name.length > 0 ? name : row.user.mobile;
  }
}

const messageSelect = {
  id: true,
  conversationId: true,
  senderType: true,
  senderUserId: true,
  body: true,
  contextUrl: true,
  createdAt: true,
  sender: {
    select: {
      mobile: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ChatMessageSelect;

class ConflictOpenException extends BadRequestException {
  constructor() {
    super('باز کردن گفتگو ناموفق بود؛ دوباره تلاش کنید.');
  }
}

function cleanBody(value: string): string {
  const cleaned = value
    .replace(/\r\n/g, '\n')
    // eslint-disable-next-line no-control-regex -- strip non-printable control characters from chat text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
  if (cleaned.length === 0) {
    throw new BadRequestException('متن پیام نمی‌تواند خالی باشد.');
  }
  if (cleaned.length > MAX_BODY) {
    throw new BadRequestException('متن پیام حداکثر ۴۰۰۰ کاراکتر است.');
  }
  return cleaned;
}

function cleanOptionalText(
  value: string | undefined,
  max: number,
): string | null {
  if (value === undefined) {
    return null;
  }
  const cleaned = value.trim();
  if (cleaned.length === 0) {
    return null;
  }
  if (cleaned.length > max) {
    throw new BadRequestException('متن واردشده بیش از حد مجاز است.');
  }
  return cleaned;
}

/**
 * Context is display-only. Accept absolute http(s) URLs or same-origin paths;
 * credentials/fragments are stripped and non-web schemes (javascript:, data:)
 * are rejected. The value is always rendered as text, never HTML.
 */
export function sanitizeContextUrl(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > MAX_CONTEXT) {
    throw new BadRequestException('نشانی صفحه حداکثر ۲۰۴۸ کاراکتر است.');
  }
  if (trimmed.startsWith('/')) {
    if (trimmed.startsWith('//')) {
      return null;
    }
    return trimmed.split('#')[0]!;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    url.username = '';
    url.password = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function parseBefore(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
