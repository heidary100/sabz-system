import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import webpush from 'web-push';
import type { NotificationDto } from '@sabz/types';
import { PrismaService } from '../../common/database/prisma.service';

const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

/**
 * Web Push endpoints are supplied by the browser, not by the API. Restrict
 * them to the public push services we support so an authenticated user cannot
 * turn notification delivery into a blind SSRF request to an internal HTTPS
 * host. Custom/self-hosted push services need an explicit allowlist entry.
 */
export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return ALLOWED_PUSH_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

/**
 * Browser Web Push (VAPID) delivery (SS-900). Disabled unless all three VAPID
 * values are configured. Credentials remain env-only; endpoints and browser
 * keys are the only values persisted. Delivery failures are best-effort and
 * never affect the in-app notification row.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private enabled: boolean;
  private readonly publicKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    const subject = configService.get<string>('VAPID_SUBJECT')?.trim();
    const publicKey = configService.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = configService.get<string>('VAPID_PRIVATE_KEY')?.trim();
    this.publicKey = publicKey && publicKey.length > 0 ? publicKey : null;
    this.enabled = Boolean(subject && publicKey && privateKey);
    if (this.enabled) {
      try {
        webpush.setVapidDetails(subject!, publicKey!, privateKey!);
      } catch (error) {
        this.logger.warn(
          `Web Push disabled: invalid VAPID configuration (${
            error instanceof Error ? error.message : 'unknown error'
          }).`,
        );
        this.enabled = false;
      }
    }
  }

  config(): { enabled: boolean; publicKey: string | null } {
    return { enabled: this.enabled, publicKey: this.publicKey };
  }

  async subscribe(
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<{ subscribed: true }> {
    if (!this.enabled) {
      throw new BadRequestException(
        'اعلان مرورگری در این سرور پیکربندی نشده است.',
      );
    }
    if (!isAllowedPushEndpoint(input.endpoint) || input.endpoint.length > 2048) {
      throw new BadRequestException('نشانی اشتراک اعلان معتبر نیست.');
    }
    if (!input.keys.p256dh || !input.keys.auth) {
      throw new BadRequestException('کلیدهای اشتراک اعلان ناقص است.');
    }
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent?.slice(0, 500) ?? null,
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent?.slice(0, 500) ?? null,
        failedAt: null,
        lastUsedAt: new Date(),
      },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ removed: number }> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { removed: result.count };
  }

  /** Fire-and-forget push; 404/410 subscriptions are marked failed. */
  async sendToUser(userId: string, notification: NotificationDto): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId, failedAt: null },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });
      if (subscriptions.length === 0) {
        return;
      }
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        notificationId: notification.id,
        url: '/notifications',
        tag: notification.id,
      });
      await Promise.all(
        subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
              { TTL: 3600 },
            );
            await this.prisma.pushSubscription.update({
              where: { id: subscription.id },
              data: { lastUsedAt: new Date(), failedAt: null },
            });
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.prisma.pushSubscription.update({
                where: { id: subscription.id },
                data: { failedAt: new Date() },
              });
              return;
            }
            this.logger.warn(
              `Web Push delivery failed endpoint=${subscription.id} status=${
                status ?? 'unknown'
              }`,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Web Push batch failed user=${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
