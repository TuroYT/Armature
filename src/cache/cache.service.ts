import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.validation.js';
import { LoggerService } from '../common/logger/logger.service.js';

/**
 * Optional Redis cache service.
 *
 * Automatically active when REDIS_URL is set — fully transparent no-op otherwise.
 * Consumers never need to check whether Redis is available.
 *
 * @example
 * ```ts
 * const cached = await this.cache.get('key');
 * if (cached) return JSON.parse(cached);
 *
 * const data = await fetchFromDb();
 * await this.cache.set('key', JSON.stringify(data), 300); // 5 min TTL
 * return data;
 * ```
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;
  private readonly logger: LoggerService;

  constructor(
    private readonly config: ConfigService<Env, true>,
    logger: LoggerService,
  ) {
    this.logger = logger.withContext('CacheService');
  }

  onModuleInit(): void {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    if (!redisUrl) {
      this.logger.debug('Redis not configured — cache disabled');
      return;
    }

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err: Error) =>
      this.logger.warn('Redis error', { error: err.message }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  /** Returns true if Redis is connected and ready. */
  get isAvailable(): boolean {
    return this.client?.status === 'ready';
  }

  /** Get a cached value. Returns null on miss or when Redis is unavailable. */
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logger.warn('Cache get failed', {
        key,
        error: (err as Error).message,
      });
      return null;
    }
  }

  /** Set a value with a TTL in seconds. No-op when Redis is unavailable. */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn('Cache set failed', {
        key,
        error: (err as Error).message,
      });
    }
  }

  /** Delete a key. No-op when Redis is unavailable. */
  async del(...keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch (err) {
      this.logger.warn('Cache del failed', {
        keys,
        error: (err as Error).message,
      });
    }
  }

  /** Invalidate all keys matching a pattern. Use sparingly — O(N) on keyspace. */
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.client) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) await this.client.del(...keys);
    } catch (err) {
      this.logger.warn('Cache invalidatePattern failed', {
        pattern,
        error: (err as Error).message,
      });
    }
  }
}
