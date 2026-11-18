import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  NOTIFICATION_TYPE_FA,
  type MarkAllNotificationsReadResponse,
  type NotificationDto,
  type NotificationListResponse,
  type NotificationPreferenceDto,
  type NotificationType,
  type UnreadCountResponse,
  type UpdateNotificationPreferenceInput,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ListNotificationsQueryDto } from './dto';
import { PushService } from './push.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  entity?: string;
  entityId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  category?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

type NotificationRow = Prisma.NotificationGetPayload<Record<string, never>>;

/**
 * In-app notification center (SS-243, extended SS-900).
 *
 * Emits are best-effort by contract: `notify`/`notifyOperators` never reject,
 * so business services stay one-line `await` calls with zero status-logic
 * coupling — a notification failure degrades to a warn log and never breaks
 * checkout/partner/return/RFQ mutations.
 *
 * The database is the source of truth. After a successful row write the
 * service pushes an authenticated WebSocket event to the recipient's room
 * (and role rooms for operator alerts) and, when VAPID is configured, a
 * browser push. Both extras are failure-isolated.
 *
 * SMS delivery remains a provider-neutral stub; no vendor has been selected
 * and `NOTIFICATIONS_SMS_ENABLED=true` only enables a log line.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly smsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    configService: ConfigService,
  ) {
    this.smsEnabled =
      configService.get<string>('NOTIFICATIONS_SMS_ENABLED') === 'true';
  }

  /** Best-effort single-recipient emit. Never rejects. */
  async notify(userId: string, input: NotifyInput): Promise<void> {
    try {
      const row = await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
          priority: input.priority ?? 'NORMAL',
          category: input.category ?? null,
        },
      });
      const notification = this.toDto(row);
      const unread = await this.countUnread(userId);
      this.realtime.emitToUser(userId, 'notification:new', {
        notification,
        unread,
      });
      void this.push.sendToUser(userId, notification);
      await this.maybeSms(userId, input);
    } catch (error) {
      this.logger.warn(
        `Notification emit failed user=${userId} type=${input.type}: ${error}`,
      );
    }
  }

  /**
   * Best-effort operator fan-out (admin alerts). One row per live
   * OPERATOR/ADMIN user; an empty staff set resolves to a no-op so local
   * seed states never error. Never rejects.
   */
  async notifyOperators(input: NotifyInput): Promise<void> {
    try {
      const operators = await this.prisma.user.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { role: { name: { in: ['OPERATOR', 'ADMIN'] } } } },
        },
        select: { id: true },
      });
      for (const operator of operators) {
        // Reuse the single-recipient path so unread counts, bridge delivery
        // and push have exactly one implementation.
        await this.notify(operator.id, {
          ...input,
          priority: input.priority ?? 'HIGH',
          category: input.category ?? 'OPERATIONS',
        });
      }
    } catch (error) {
      this.logger.warn(`Operator fan-out failed type=${input.type}: ${error}`);
    }
  }

  /** Owner list, newest-first (`createdAt DESC`, then `id DESC`). */
  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.unreadOnly === true ? { readAt: null } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      items: rows.map((row) => this.toDto(row)),
      total,
      page,
      limit,
    };
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    return { unread: await this.countUnread(userId) };
  }

  /**
   * Marks one owned row read (idempotent — re-reads succeed). Unknown or
   * other-user ids are non-disclosure 404s.
   */
  async markRead(userId: string, id: string): Promise<NotificationDto> {
    const row = await this.prisma.notification.findUnique({ where: { id } });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('اعلان یافت نشد.');
    }
    const updated =
      row.readAt !== null
        ? row
        : await this.prisma.notification.update({
            where: { id },
            data: { readAt: new Date() },
          });
    const unread = await this.countUnread(userId);
    this.realtime.emitToUser(userId, 'notification:read', {
      id: updated.id,
      unread,
    });
    return this.toDto(updated);
  }

  /** Marks every owned unread row read and pushes the new count. */
  async markAllRead(userId: string): Promise<MarkAllNotificationsReadResponse> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    this.realtime.emitToUser(userId, 'notification:unread', { unread: 0 });
    return { updated: result.count, unread: 0 };
  }

  async preferences(userId: string): Promise<NotificationPreferenceDto> {
    const row = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return {
      soundEnabled: row?.soundEnabled ?? true,
      browserPushEnabled: row?.browserPushEnabled ?? false,
    };
  }

  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferenceInput,
  ): Promise<NotificationPreferenceDto> {
    if (input.browserPushEnabled === true && !this.push.config().enabled) {
      throw new BadRequestException(
        'اعلان مرورگری در این سرور پیکربندی نشده است.',
      );
    }
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        soundEnabled: input.soundEnabled ?? true,
        browserPushEnabled: input.browserPushEnabled ?? false,
      },
      update: {
        ...(input.soundEnabled !== undefined
          ? { soundEnabled: input.soundEnabled }
          : {}),
        ...(input.browserPushEnabled !== undefined
          ? { browserPushEnabled: input.browserPushEnabled }
          : {}),
      },
    });
    return {
      soundEnabled: row.soundEnabled,
      browserPushEnabled: row.browserPushEnabled,
    };
  }

  private async countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  /**
   * SMS stub (SS-243). Disabled by default; when enabled, resolves the
   * recipient mobile and logs the would-be send. The future provider
   * adapter replaces this body; no SMS delivery is claimed here.
   */
  private async maybeSms(userId: string, input: NotifyInput): Promise<void> {
    if (!this.smsEnabled) {
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mobile: true },
    });
    this.logger.log(
      `SMS stub → ${user?.mobile ?? userId} [${input.type}]: ${input.title}`,
    );
  }

  private toDto(row: NotificationRow): NotificationDto {
    return {
      id: row.id,
      type: row.type as NotificationType,
      typeFa: NOTIFICATION_TYPE_FA[row.type as NotificationType],
      title: row.title,
      body: row.body,
      priority: row.priority,
      category: row.category,
      entity: row.entity,
      entityId: row.entityId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
