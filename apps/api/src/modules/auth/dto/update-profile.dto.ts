import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ali', description: 'First name' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'firstName must be a string' })
  @MaxLength(100, { message: 'firstName must be at most 100 characters' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Ahmadi', description: 'Last name' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString({ message: 'lastName must be a string' })
  @MaxLength(100, { message: 'lastName must be at most 100 characters' })
  lastName?: string;

  @ApiPropertyOptional({ example: 'Tehran, Iran', description: 'Address' })
  @IsOptional()
  @IsString({ message: 'address must be a string' })
  @MaxLength(500, { message: 'address must be at most 500 characters' })
  address?: string;
}
