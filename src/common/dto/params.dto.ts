import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Base DTO for routes with a single :id param.
 * Use plainToInstance + validateOrReject in guards for type-safe param access.
 */
export class IdParamsDto {
  @ApiProperty({ description: 'Resource ID' })
  @IsString()
  @IsNotEmpty()
  id!: string;
}
