import { ApiProperty } from '@nestjs/swagger';

export class AuthMethodDto {
  @ApiProperty({ example: 'password' })
  id!: string;

  @ApiProperty({ example: 'Email & Password' })
  label!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;
}

export class AuthMethodsResponseDto {
  @ApiProperty({ type: [AuthMethodDto] })
  methods!: AuthMethodDto[];
}
