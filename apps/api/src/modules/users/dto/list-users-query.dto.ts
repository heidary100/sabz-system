import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { UserStatus } from '@prisma/client';
import { AppRole } from '../../auth/enums/app-role.enum';

export class ListUsersQueryDto {
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
    description: 'Search term matched against mobile, first name or last name.',
    maxLength: 32,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'search باید رشته باشد.' })
  @MaxLength(32, { message: 'search باید حداکثر ۳۲ کاراکتر باشد.' })
  search?: string;

  @ApiPropertyOptional({
    enum: UserStatus,
    description: 'Filter by account status.',
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'status معتبر نیست.' })
  status?: UserStatus;

  @ApiPropertyOptional({
    enum: AppRole,
    description: 'Filter by assigned role.',
  })
  @IsOptional()
  @IsEnum(AppRole, { message: 'role معتبر نیست.' })
  role?: AppRole;
}