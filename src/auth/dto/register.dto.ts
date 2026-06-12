import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ErrorCode } from '../../common/constants/error-constants.js';

export class RegisterDto {
  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'SecurePassword1!',
    minLength: 8,
    description:
      'Must be ≥ 8 characters and contain at least one uppercase letter, one lowercase letter, and one digit or special character.',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d!@#$%^&*()\-_=+[\]{};:'",.<>/?\\|`~])/, {
    message: ErrorCode.PASSWORD_TOO_WEAK,
  })
  password!: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;
}
