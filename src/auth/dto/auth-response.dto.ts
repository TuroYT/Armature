import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';

export class RoleResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() label!: string;
}

/**
 * @Expose() marks the fields that are safe to return to the client.
 * Use with serialize(UserResponseDto, user) — sensitive fields (passwordHash…) are excluded.
 */
export class UserResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() email!: string;
  @Expose() @ApiProperty({ required: false, nullable: true }) firstName!:
    | string
    | null;
  @Expose() @ApiProperty({ required: false, nullable: true }) lastName!:
    | string
    | null;
  @Expose() @ApiProperty({ required: false, nullable: true }) avatarUrl!:
    | string
    | null;
  @Expose()
  @ApiProperty({ type: [RoleResponseDto] })
  @Type(() => RoleResponseDto)
  roles!: RoleResponseDto[];
  @Expose() @ApiProperty() createdAt!: Date;
}

export class AuthResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ type: UserResponseDto }) user!: UserResponseDto;
}

export class TokensResponseDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
}
