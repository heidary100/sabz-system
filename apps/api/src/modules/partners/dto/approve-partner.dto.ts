import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApprovePartnerDto {
  @ApiProperty({ description: 'Partner tier to assign on approval' })
  @IsUUID('4', { message: 'tierId معتبر نیست.' })
  @IsNotEmpty({ message: 'tierId الزامی است.' })
  tierId!: string;

  @ApiPropertyOptional({ description: 'Internal review notes (not shown to the applicant)' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reviewNotes باید رشته باشد.' })
  @MaxLength(1000, { message: 'reviewNotes باید حداکثر ۱۰۰۰ کاراکتر باشد.' })
  reviewNotes?: string;
}
