import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';

/**
 * In-app notification center (SS-243/SS-900). Prisma and Config are global;
 * RealtimeModule supplies authenticated WebSocket fan-out, PushService
 * supplies optional VAPID browser push. Domain modules import this module
 * without a cycle.
 */
@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationService, PushService],
  exports: [NotificationService, PushService],
})
export class NotificationsModule {}
