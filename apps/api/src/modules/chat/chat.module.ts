import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminChatController } from './admin-chat.controller';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, NotificationsModule, RealtimeModule],
  controllers: [ChatController, AdminChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
