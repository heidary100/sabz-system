import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { HomepagePublicationStatus } from '@sabz/types';

const PUBLICATION_STATUSES: HomepagePublicationStatus[] = [
  'SCHEDULED',
  'PUBLISHED',
  'SUPERSEDED',
  'CANCELLED',
];

export class ListHomepagePublicationsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit باید حداکثر ۱۰۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({ enum: PUBLICATION_STATUSES })
  @IsOptional()
  @IsIn(PUBLICATION_STATUSES, { message: 'وضعیت انتشار معتبر نیست.' })
  status?: HomepagePublicationStatus;
}
