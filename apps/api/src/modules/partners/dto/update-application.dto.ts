import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateApplicationDto {
  @ApiPropertyOptional({ description: 'Business name' })
  @IsOptional()
  @IsString({ message: 'businessName باید رشته باشد.' })
  @IsNotEmpty({ message: 'businessName نباید خالی باشد.' })
  @MaxLength(200, { message: 'businessName باید حداکثر ۲۰۰ کاراکتر باشد.' })
  businessName?: string;

  @ApiPropertyOptional({ description: 'Business license number' })
  @IsOptional()
  @IsString({ message: 'businessLicenseNo باید رشته باشد.' })
  @MaxLength(100, { message: 'businessLicenseNo باید حداکثر ۱۰۰ کاراکتر باشد.' })
  businessLicenseNo?: string;

  @ApiPropertyOptional({ description: 'National ID' })
  @IsOptional()
  @IsString({ message: 'nationalId باید رشته باشد.' })
  @MaxLength(100, { message: 'nationalId باید حداکثر ۱۰۰ کاراکتر باشد.' })
  nationalId?: string;

  @ApiPropertyOptional({ description: 'Website' })
  @IsOptional()
  @IsString({ message: 'website باید رشته باشد.' })
  @MaxLength(200, { message: 'website باید حداکثر ۲۰۰ کاراکتر باشد.' })
  website?: string;

  @ApiPropertyOptional({ description: 'Full business address' })
  @IsOptional()
  @IsString({ message: 'address باید رشته باشد.' })
  @MaxLength(500, { message: 'address باید حداکثر ۵۰۰ کاراکتر باشد.' })
  address?: string;

  @ApiPropertyOptional({ description: 'Business city' })
  @IsOptional()
  @IsString({ message: 'city باید رشته باشد.' })
  @MaxLength(100, { message: 'city باید حداکثر ۱۰۰ کاراکتر باشد.' })
  city?: string;

  @ApiPropertyOptional({ description: 'Business province' })
  @IsOptional()
  @IsString({ message: 'province باید رشته باشد.' })
  @MaxLength(100, { message: 'province باید حداکثر ۱۰۰ کاراکتر باشد.' })
  province?: string;

  @ApiPropertyOptional({ description: 'Submit the application (or resubmit a rejected one)' })
  @IsOptional()
  @IsBoolean({ message: 'submit باید مقدار بولی باشد.' })
  submit?: boolean;
}
