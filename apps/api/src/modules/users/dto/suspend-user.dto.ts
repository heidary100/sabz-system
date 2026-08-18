import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function normalizeReason(value: unknown): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

export class SuspendUserDto {
  @ApiPropertyOptional({ description: 'Optional suspension reason' })
  @IsOptional()
  @Transform(({ value }) => normalizeReason(value))
  @IsString({ message: 'reason باید رشته باشد.' })
  @MaxLength(500, { message: 'reason باید حداکثر ۵۰۰ کاراکتر باشد.' })
  reason?: string;
}
