import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { ReturnStatus } from '@sabz/types';

/**
 * Owner return-list query (SS-242). Newest-first, page/limit; the optional
 * status filter lets owners audit closed rows.
 */
export class ReturnListQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'APPROVED', 'RECEIVED', 'COMPLETED', 'REJECTED', 'CANCELLED'],
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

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(50, { message: 'limit حداکثر ۵۰ است.' })
  limit?: number;
}
