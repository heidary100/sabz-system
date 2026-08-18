import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListAuditQueryDto {
  @ApiPropertyOptional({
    description: 'Page number, starting at 1.',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page باید عدد صحیح باشد.' })
  @Min(1, { message: 'page باید حداقل ۱ باشد.' })
  page?: number;

  @ApiPropertyOptional({
    description: 'Page size. Maximum 100.',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit باید عدد صحیح باشد.' })
  @Min(1, { message: 'limit باید حداقل ۱ باشد.' })
  @Max(100, { message: 'limit باید حداکثر ۱۰۰ باشد.' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by the acting user (AuditLog.userId), exact UUID.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'actorId باید یک UUID معتبر باشد.' })
  actorId?: string;

  @ApiPropertyOptional({
    description: 'Filter by audit action, exact match (e.g. USER_SUSPENDED).',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'action باید رشته باشد.' })
  @MaxLength(64, { message: 'action باید حداکثر ۶۴ کاراکتر باشد.' })
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter by audit entity, exact match (e.g. User, Partner).',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'entity باید رشته باشد.' })
  @MaxLength(64, { message: 'entity باید حداکثر ۶۴ کاراکتر باشد.' })
  entity?: string;

  @ApiPropertyOptional({
    description: 'Filter by the audited entity id, exact UUID.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'entityId باید یک UUID معتبر باشد.' })
  entityId?: string;

  @ApiPropertyOptional({
    description:
      'Lower bound of the createdAt window (ISO 8601 UTC), inclusive.',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(undefined, { message: 'from باید یک زمان ISO 8601 معتبر باشد.' })
  from?: string;

  @ApiPropertyOptional({
    description:
      'Upper bound of the createdAt window (ISO 8601 UTC), inclusive.',
    format: 'date-time',
  })
  @IsOptional()
  @IsISO8601(undefined, { message: 'to باید یک زمان ISO 8601 معتبر باشد.' })
  to?: string;
}
