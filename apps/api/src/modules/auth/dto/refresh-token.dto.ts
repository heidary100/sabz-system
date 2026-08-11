import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description:
      'Valid refresh token. May be omitted when the refresh token is sent as an HttpOnly cookie.',
  })
  @IsOptional()
  @IsString()
  @Length(10, 512, {
    message: 'refreshToken must be a valid JWT string',
  })
  refreshToken?: string;
}
