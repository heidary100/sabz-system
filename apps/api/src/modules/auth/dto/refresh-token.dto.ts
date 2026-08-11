import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIs...',
    description: 'Valid refresh token',
  })
  @IsString()
  @Length(10, 512, {
    message: 'refreshToken must be a valid JWT string',
  })
  refreshToken!: string;
}
