import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — bypasses the global JwtAuthGuard.
 *
 * @example
 * ```ts
 * @Public()
 * @Post('login')
 * login(@Body() dto: LoginDto) { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
