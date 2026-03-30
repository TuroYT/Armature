import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  message!: string | string[];

  @ApiProperty({ example: 'INVALID_CREDENTIALS' })
  error!: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/api/auth/login' })
  path!: string;
}
