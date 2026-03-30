import { ApiProperty } from '@nestjs/swagger';
import type { Type } from '@nestjs/common';

export class PaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

/**
 * Factory that creates a concrete paginated DTO with correct Swagger types.
 *
 * @example
 * ```ts
 * class PaginatedUsersDto extends createPaginatedDto(UserResponseDto) {}
 * ```
 */
export function createPaginatedDto<T>(ItemClass: Type<T>) {
  class PaginatedDto {
    @ApiProperty({ type: [ItemClass] })
    data!: T[];

    @ApiProperty({ type: PaginationMetaDto })
    meta!: PaginationMetaDto;
  }

  return PaginatedDto;
}

/** Build a pagination meta object from query params and total count. */
export function buildPaginationMeta(
  page: number,
  limit: number,
  total: number,
): PaginationMetaDto {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
