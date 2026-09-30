import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { ReturnStatus } from '@sabz/types';

/**
 * Operator returns queue query (SS-242). Defaults to the PENDING worklist;
 * ordering is always newest-first (createdAt DESC, id DESC).
 */
export class ListAdminReturnsQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'APPROVED', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
    default: 'PENDING',
  })
  @IsOptional()
  @IsEnum(['PENDING', 'APPROVED', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED'], {
    message: 'وضعیت مرجوعی معتبر نیست.',
  })
  status?: ReturnStatus;

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
