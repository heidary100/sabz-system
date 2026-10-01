import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';

/**
 * In-app notification center (SS-243). Leaf module by design: Prisma and
 * Config are global, so it imports nothing and every domain module
 * (orders/partners/returns/rfq) can import it without a cycle.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
