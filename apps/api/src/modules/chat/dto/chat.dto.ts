import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ChatConversationStatus } from '@prisma/client';

function trimOptional(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class OpenChatConversationDto {
  @ApiPropertyOptional({ description: 'Current storefront page URL (validated/sanitized)' })
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString({ message: 'نشانی صفحه معتبر نیست.' })
  @MaxLength(2048, { message: 'نشانی صفحه حداکثر ۲۰۴۸ کاراکتر است.' })
  contextUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString({ message: 'موضوع گفتگو معتبر نیست.' })
  @MaxLength(200, { message: 'موضوع گفتگو حداکثر ۲۰۰ کاراکتر است.' })
  subject?: string;
}

export class SendChatMessageDto {
  @ApiProperty({ description: 'Plain-text message, max 4000 chars' })
  @IsString({ message: 'متن پیام الزامی است.' })
  @MaxLength(4000, { message: 'متن پیام حداکثر ۴۰۰۰ کاراکتر است.' })
  body!: string;

  @ApiPropertyOptional({ description: 'Client-generated idempotency key' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;

  @ApiPropertyOptional({ description: 'Current storefront page URL' })
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString({ message: 'نشانی صفحه معتبر نیست.' })
  @MaxLength(2048)
  contextUrl?: string;
}

export class ListChatMessagesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  before?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  limit?: number;
}

export class ListAdminChatQueryDto {
  @ApiPropertyOptional({ enum: ChatConversationStatus })
  @IsOptional()
  @IsEnum(ChatConversationStatus, { message: 'وضعیت گفتگو معتبر نیست.' })
  status?: ChatConversationStatus;

  @ApiPropertyOptional({ enum: ['me', 'unassigned', 'all'] })
  @IsOptional()
  @IsEnum(['me', 'unassigned', 'all'], { message: 'فیلتر مسئول معتبر نیست.' })
  assigned?: 'me' | 'unassigned' | 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => trimOptional(value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit حداکثر ۱۰۰ است.' })
  limit?: number;
}

export class UpdateChatConversationDto {
  @ApiPropertyOptional({ enum: ChatConversationStatus })
  @IsOptional()
  @IsEnum(ChatConversationStatus, { message: 'وضعیت گفتگو معتبر نیست.' })
  status?: ChatConversationStatus;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID('4', { message: 'شناسه مسئول معتبر نیست.' })
  assignedToId?: string | null;
}
