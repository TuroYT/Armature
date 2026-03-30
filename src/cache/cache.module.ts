import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service.js';

/**
 * Global cache module — CacheService is available everywhere.
 * Redis is used automatically when REDIS_URL is set, no-op otherwise.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
