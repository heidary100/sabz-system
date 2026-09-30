import { ApiPropertyOptional } from '@nestjs/swagger';
import { BlogStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Admin blog queue query (SS-240E). No status default — the panel lists
 * DRAFT and PUBLISHED together unless filtered. Ordering is always
 * newest-first (createdAt DESC, id DESC) so the queue reads stable.
 */
export class ListAdminBlogPostsQueryDto {
  @ApiPropertyOptional({
    enum: BlogStatus,
    description: 'Filter by moderation state (omit for all).',
  })
  @IsOptional()
  @IsEnum(BlogStatus, { message: 'وضعیت مطلب معتبر نیست.' })
  status?: BlogStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(50, { message: 'limit حداکثر ۵۰ است.' })
  limit?: number;
}
