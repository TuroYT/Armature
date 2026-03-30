import { plainToInstance } from 'class-transformer';
import type { ClassConstructor } from 'class-transformer';

/**
 * Converts a plain object (e.g. a Prisma model) into a typed response DTO,
 * stripping any field not decorated with @Expose().
 *
 * Use this in services to safely map internal models to API responses.
 *
 * @example
 * ```ts
 * return serialize(UserResponseDto, user);
 * return serialize(ResourceResponseDto, resources); // also works with arrays
 * ```
 */
export function serialize<T>(cls: ClassConstructor<T>, plain: unknown): T {
  return plainToInstance(cls, plain, { excludeExtraneousValues: true });
}
