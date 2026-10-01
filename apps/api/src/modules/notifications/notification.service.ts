import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  NOTIFICATION_TYPE_FA,
  type NotificationDto,
  type NotificationListResponse,
  type NotificationType,
  type UnreadCountResponse,
} from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';
import { ListNotificationsQueryDto } from './dto';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  entity?: string;
  entityId?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

type NotificationRow = Prisma.NotificationGetPayload<Record<string, never>>;

/**
 * In-app notification center (SS-243, master plan §6 Stage 3).
 *
 * Emits are best-effort by contract: `notify`/`notifyOperators` never
 * reject, so business services stay one-line `await` calls with zero
 * status-logic coupling — a notification failure degrades to a warn log
 * and never breaks checkout/partner/return/RFQ mutations.
 *
 * SMS delivery is a log-only stub (no provider credentials in repo):
 * `NOTIFICATIONS_SMS_ENABLED=true` only enables the log line; the future
 * provider ticket replaces `sendSmsStub` without touching emitters.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly smsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.smsEnabled =
      configService.get<string>('NOTIFICATIONS_SMS_ENABLED') === 'true';
  }

  /** Best-effort single-recipient emit. Never rejects. */
  async notify(userId: string, input: NotifyInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
        },
        select: { id: true },
      });
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
          roles: { some: { role: { name: { in: ['OPERATOR', 'ADMIN'] } } } },
        },
        select: { id: true },
      });
      if (operators.length === 0) {
        return;
      }
      await this.prisma.notification.createMany({
        data: operators.map((operator) => ({
          userId: operator.id,
          type: input.type,
          title: input.title,
          body: input.body,
          entity: input.entity ?? null,
          entityId: input.entityId ?? null,
        })),
      });
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
    const unread = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { unread };
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
    return this.toDto(updated);
  }

  /**
   * SMS stub (SS-243). Disabled by default; when enabled, resolves the
   * recipient mobile and logs the would-be send. The provider ticket
   * swaps this body for a real vendor call.
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
      entity: row.entity,
      entityId: row.entityId,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
