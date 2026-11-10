import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MERCH_CAMPAIGN_TYPES, type MerchCampaignType } from '@sabz/types';

function toBoolean(value: unknown): unknown {
  if (value === 'true' || value === true || value === '1') return true;
  if (value === 'false' || value === false || value === '0') return false;
  return value;
}

export class ListMerchCampaignsQueryDto {
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

  @ApiPropertyOptional({ description: 'Search internal name or Persian title.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'q باید رشته باشد.' })
  @MaxLength(255, { message: 'q باید حداکثر ۲۵۵ کاراکتر باشد.' })
  q?: string;

  @ApiPropertyOptional({ enum: MERCH_CAMPAIGN_TYPES })
  @IsOptional()
  @IsIn(MERCH_CAMPAIGN_TYPES, { message: 'نوع کمپین معتبر نیست.' })
  type?: MerchCampaignType;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isEnabled باید مقدار بولی باشد.' })
  isEnabled?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean({ message: 'isArchived باید مقدار بولی باشد.' })
  isArchived?: boolean;
}
