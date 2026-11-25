import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const RELATIVE_OR_HTTPS = /^(?:\/[^\s]*|https:\/\/[^\s]+)$/i;

export class FooterLinkDto {
  @ApiProperty()
  @IsString({ message: 'برچسب پیوند الزامی است.' })
  @MaxLength(120)
  label!: string;

  @ApiProperty()
  @IsString({ message: 'نشانی پیوند الزامی است.' })
  @MaxLength(2048)
  @Matches(RELATIVE_OR_HTTPS, {
    message: 'نشانی پیوند باید نسبی (با /) یا https باشد.',
  })
  href!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  external?: boolean;
}

export class FooterColumnDto {
  @ApiProperty()
  @IsString({ message: 'عنوان ستون الزامی است.' })
  @MaxLength(120)
  title!: string;

  @ApiProperty({ type: [FooterLinkDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  links!: FooterLinkDto[];
}

export class FooterContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  hours?: string | null;
}

export class FooterSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  blurb?: string | null;

  @ApiProperty({ type: [FooterColumnDto] })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => FooterColumnDto)
  columns!: FooterColumnDto[];

  @ApiProperty({ type: FooterContactDto })
  @ValidateNested()
  @Type(() => FooterContactDto)
  contact!: FooterContactDto;

  @ApiProperty({ type: [FooterLinkDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  socials!: FooterLinkDto[];

  @ApiProperty({ type: [FooterLinkDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FooterLinkDto)
  legalLinks!: FooterLinkDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  copyright?: string | null;
}

export class UpdateFooterSettingsDto {
  @ApiProperty({ type: FooterSettingsDto })
  @ValidateNested()
  @Type(() => FooterSettingsDto)
  value!: FooterSettingsDto;

  @ApiProperty()
  @IsInt()
  @Min(0)
  version!: number;
}
