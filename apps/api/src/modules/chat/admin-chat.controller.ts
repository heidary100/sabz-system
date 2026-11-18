import {
  Body,
  Controller,
  Get,
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
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AppRole } from '../auth/enums/app-role.enum';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ChatService } from './chat.service';
import {
  ListAdminChatQueryDto,
  SendChatMessageDto,
  UpdateChatConversationDto,
} from './dto/chat.dto';

/**
 * Operator support inbox (SS-900). Every route requires OPERATOR/ADMIN and
 * the service validates assignment targets against the same role set.
 */
@ApiTags('admin-chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AppRole.OPERATOR, AppRole.ADMIN)
@Controller('admin/chat')
export class AdminChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Support conversation inbox with unread/assignment filters' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListAdminChatQueryDto,
  ) {
    return this.chat.adminList(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Support inbox counters (unread conversations, unassigned)' })
  async unreadCount(@CurrentUser() user: AuthUser) {
    const result = await this.chat.adminList(user.userId, {
      page: 1,
      limit: 1,
      assigned: 'all',
    });
    return {
      unreadConversations: result.unreadConversations,
      unassigned: result.unassigned,
    };
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Full conversation with message history' })
  @ApiParam({ name: 'id' })
  async detail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.chat.adminDetail(id);
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reply as an operator' })
  async send(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chat.sendAdmin(user.userId, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark admin-side messages read' })
  async read(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.chat.markAdminRead(user.userId, id);
  }

  @Patch('conversations/:id')
  @ApiOperation({ summary: 'Assign or change conversation status' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateChatConversationDto,
  ) {
    return this.chat.updateConversation(id, dto, user.userId);
  }
}
