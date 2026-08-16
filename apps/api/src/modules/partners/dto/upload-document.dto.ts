import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PartnerDocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({
    enum: PartnerDocumentType,
    example: PartnerDocumentType.BUSINESS_LICENSE,
    description: 'Document type',
  })
  @IsEnum(PartnerDocumentType, { message: 'نوع سند معتبر نیست.' })
  type!: PartnerDocumentType;
}
