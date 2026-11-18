import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';
import { ChatService } from './chat.service';
import {
  ListChatMessagesQueryDto,
  OpenChatConversationDto,
  SendChatMessageDto,
} from './dto/chat.dto';

/**
 * Customer support chat endpoints (SS-900). Every route is authenticated and
 * scoped to the caller; conversations are never addressed by another user's
 * id. Message sends carry a per-route flood guard below the service-level
 * rolling window.
 */
@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversation')
  @ApiOperation({ summary: 'Current customer conversation (or null)' })
  async state(@CurrentUser() user: AuthUser) {
    return this.chat.customerState(user.userId);
  }

  @Post('conversation')
  @ApiOperation({ summary: 'Open or resume the customer conversation' })
  @ApiResponse({ status: 201, description: 'Conversation returned.' })
  async open(
    @CurrentUser() user: AuthUser,
    @Body() dto: OpenChatConversationDto,
  ) {
    return this.chat.open(user.userId, dto);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Older messages in the customer conversation' })
  async messages(
    @CurrentUser() user: AuthUser,
    @Query() query: ListChatMessagesQueryDto,
  ) {
    return this.chat.customerMessages(user.userId, query);
  }

  @Post('messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a plain-text message as the customer' })
  async send(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.chat.sendCustomer(user.userId, dto);
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark customer-side messages read' })
  async read(@CurrentUser() user: AuthUser) {
    return this.chat.markCustomerRead(user.userId);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close the customer conversation' })
  async close(@CurrentUser() user: AuthUser) {
    return this.chat.closeCustomer(user.userId);
  }
}
