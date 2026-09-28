import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { RfqStatus } from '@sabz/types';

/**
 * RFQ list query (SS-235 B2). Newest-first, page/limit; the optional
 * status filter drives the minimal operator quoting queue (full admin
 * UI arrives with SS-240).
 */
export class RfqListQueryDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'],
  })
  @IsOptional()
  @IsEnum(['PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED'], {
    message: 'وضعیت استعلام معتبر نیست.',
  })
  status?: RfqStatus;

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
