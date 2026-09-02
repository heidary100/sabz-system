import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

function normalizeNullableOptional(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return value;
}

export class ReorderCategoryDto {
  @ApiPropertyOptional({
    description: 'Parent category id. Pass null to move to root.',
    type: String,
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeNullableOptional(value))
  @IsUUID('all', { message: 'parentId باید شناسه UUID معتبر باشد.' })
  parentId?: string | null;

  @ApiPropertyOptional({
    description: 'Zero-based position among the target parent\u2019s children.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'position باید عدد صحیح باشد.' })
  @Min(0, { message: 'position باید حداقل ۰ باشد.' })
  position?: number;
}