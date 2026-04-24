// src/common/rate-limit/rate-limit.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../redis/redis.module';
import type Redis from 'ioredis';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly defaultConfig: RateLimitConfig = {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    keyPrefix: 'rate_limit',
  };

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async checkRateLimit(
    identifier: string,
    endpoint: string,
    config?: Partial<RateLimitConfig>,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: Date }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = `${finalConfig.keyPrefix}:${endpoint}:${identifier}`;
    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;

    try {
      // Remove old entries
      await this.redis.zremrangebyscore(key, 0, windowStart);

      // Get current count
      const count = await this.redis.zcard(key);
      const remaining = Math.max(0, finalConfig.maxRequests - count);
      const allowed = count < finalConfig.maxRequests;

      // Get oldest timestamp for reset time
      const oldest = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
      const resetTime =
        oldest.length > 0
          ? new Date(parseInt(oldest[1], 10) + finalConfig.windowMs)
          : new Date(now + finalConfig.windowMs);

      if (!allowed) {
        this.logger.warn(
          `Rate limit exceeded for ${identifier} on ${endpoint}`,
        );
      }

      return { allowed, remaining, resetTime };
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Rate limit check failed: ${error.message}`);
      return {
        allowed: true,
        remaining: 1,
        resetTime: new Date(now + finalConfig.windowMs),
      };
    }
  }

  async recordRequest(
    identifier: string,
    endpoint: string,
    config?: Partial<RateLimitConfig>,
  ): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const key = `${finalConfig.keyPrefix}:${endpoint}:${identifier}`;
    const now = Date.now();

    await this.redis.zadd(key, now, `${now}:${Math.random()}`);
    await this.redis.expire(key, Math.ceil(finalConfig.windowMs / 1000) + 60);
  }

  async getRemaining(identifier: string, endpoint: string): Promise<number> {
    const key = `rate_limit:${endpoint}:${identifier}`;
    const windowStart = Date.now() - 60 * 60 * 1000;
    await this.redis.zremrangebyscore(key, 0, windowStart);
    const count = await this.redis.zcard(key);
    return Math.max(0, 10 - count);
  }

  async resetLimit(identifier: string, endpoint: string): Promise<void> {
    const key = `rate_limit:${endpoint}:${identifier}`;
    await this.redis.del(key);
    this.logger.log(`Rate limit reset for ${identifier} on ${endpoint}`);
  }
}
