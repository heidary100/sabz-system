import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectPartnerDto {
  @ApiProperty({ description: 'Reason shown to the applicant' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reason باید رشته باشد.' })
  @IsNotEmpty({ message: 'reason الزامی است.' })
  @MaxLength(500, { message: 'reason باید حداکثر ۵۰۰ کاراکتر باشد.' })
  reason!: string;

  @ApiPropertyOptional({ description: 'Internal review notes (not shown to the applicant)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reviewNotes باید رشته باشد.' })
  @MaxLength(1000, { message: 'reviewNotes باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  reviewNotes?: string;
}
