import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { ReviewStatus } from '@sabz/types';

/**
 * Moderation queue query (SS-240D). Status filter defaults to PENDING
 * (the unmoderated worklist); ordering is always newest-first
 * (createdAt DESC, id DESC) so the queue reads stable.
 */
export class ListAdminReviewsQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
  })
  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'REJECTED'], {
    message: 'وضعیت دیدگاه معتبر نیست.',
  })
  status?: ReviewStatus;

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
