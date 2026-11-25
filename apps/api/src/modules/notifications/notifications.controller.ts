import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ListNotificationsQueryDto } from './dto';
import {
  PushSubscriptionDto,
  UnsubscribePushDto,
  UpdateNotificationPreferenceDto,
} from './dto/push.dto';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';

/**
 * Owner notification endpoints (SS-243/SS-900). All routes are authenticated
 * (`JwtAuthGuard`, no roles — self-owned state) and scoped to the caller's
 * userId; unknown/other-user ids are non-disclosure 404s. Operators read
 * their admin-alert rows through the same endpoints.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List the authenticated user’s notifications (newest first)' })
  @ApiResponse({ status: 200, description: 'Notifications returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationService.list(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count the authenticated user’s unread notifications' })
  @ApiResponse({ status: 200, description: 'Unread count returned.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationService.unreadCount(user.userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one of the user’s notifications read' })
  @ApiParam({ name: 'id', description: 'Notification id' })
  @ApiResponse({ status: 200, description: 'Notification marked read.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiResponse({ status: 404, description: 'Notification not found.' })
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.notificationService.markRead(user.userId, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all of the user’s notifications read' })
  async markAllRead(@CurrentUser() user: AuthUser) {
    return this.notificationService.markAllRead(user.userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Notification sound / browser-push preferences' })
  async preferences(@CurrentUser() user: AuthUser) {
    return this.notificationService.preferences(user.userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationService.updatePreferences(user.userId, dto);
  }

  @Get('push/config')
  @ApiOperation({ summary: 'Web Push availability and public VAPID key' })
  async pushConfig() {
    return this.pushService.config();
  }

  @Post('push/subscribe')
  @ApiOperation({ summary: 'Register a browser push subscription' })
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: PushSubscriptionDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.pushService.subscribe(user.userId, dto, userAgent);
  }

  @Delete('push/subscribe')
  @ApiOperation({ summary: 'Remove the caller’s browser push subscription' })
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: UnsubscribePushDto,
  ) {
    return this.pushService.unsubscribe(user.userId, dto.endpoint);
  }
}
