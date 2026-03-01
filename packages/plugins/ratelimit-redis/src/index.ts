import Redis from "ioredis";

import type {
  RateLimitClient,
  RateLimitConfig,
  RateLimitResult,
} from "@karakeep/shared/ratelimiting";
import { PluginProvider } from "@karakeep/shared/plugins";

const KEY_PREFIX = "ratelimit:v1";

export class RedisRateLimiter implements RateLimitClient {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async checkRateLimit(
    config: RateLimitConfig,
    key: string,
  ): Promise<RateLimitResult> {
    if (!key) {
      return { allowed: true };
    }

    const rateLimitKey = `${KEY_PREFIX}:${config.name}:${key}`;
    const rateLimitSequenceKey = `${rateLimitKey}:seq`;
    const now = Date.now();

    try {
      // Use a Lua script to ensure atomicity
      // This script:
      // 1. Removes old entries outside the time window
      // 2. Counts current entries
      // 3. Adds new entry if under limit
      // 4. Sets expiration on the key
      const luaScript = `
        local key = KEYS[1]
        local sequenceKey = KEYS[2]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local maxRequests = tonumber(ARGV[3])
        local windowStart = now - window

        -- Remove old entries
        redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

        -- Count current requests
        local current = redis.call('ZCARD', key)

        if current < maxRequests then
          -- Add new request
          local seq = redis.call('INCR', sequenceKey)
          redis.call('ZADD', key, now, now .. ':' .. seq)
          -- Set expiration (window in milliseconds converted to seconds, plus 1 for safety)
          redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
          redis.call('EXPIRE', sequenceKey, math.ceil(window / 1000) + 1)
          return {1, 0} -- allowed, resetInSeconds
        else
          -- Get the oldest entry to calculate reset time
          local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
          local resetTime = tonumber(oldest[2]) + window
          local resetInSeconds = math.ceil((resetTime - now) / 1000)
          return {0, resetInSeconds} -- not allowed, resetInSeconds
        end
      `;

      const result = (await this.redis.eval(
        luaScript,
        2,
        rateLimitKey,
        rateLimitSequenceKey,
        now.toString(),
        config.windowMs.toString(),
        config.maxRequests.toString(),
      )) as [number, number];

      const [allowed, resetInSeconds] = result;

      if (allowed === 1) {
        return { allowed: true };
      } else {
        return {
          allowed: false,
          resetInSeconds: resetInSeconds,
        };
      }
    } catch (error) {
      // On Redis error, fail open (allow the request)
      console.error("Redis rate limit error:", error);
      return { allowed: true };
    }
  }

  async reset(config: RateLimitConfig, key: string) {
    const rateLimitKey = `${KEY_PREFIX}:${config.name}:${key}`;
    const rateLimitSequenceKey = `${rateLimitKey}:seq`;
    try {
      await this.redis.del(rateLimitKey, rateLimitSequenceKey);
    } catch (error) {
      console.error("Redis rate limit reset error:", error);
    }
  }

  async clear() {
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          `${KEY_PREFIX}:*`,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } while (cursor !== "0");
    } catch (error) {
      console.error("Redis rate limit clear error:", error);
    }
  }

  async disconnect() {
    await this.redis.quit();
  }
}

export interface RedisRateLimiterOptions {
  url: string;
}

export class RedisRateLimitProvider implements PluginProvider<RateLimitClient> {
  private client: RedisRateLimiter | null = null;
  private clientInitPromise: Promise<RedisRateLimiter | null> | null = null;
  private nextRetryAt = 0;
  private options: RedisRateLimiterOptions;
  private static readonly RETRY_BACKOFF_MS = 5_000;

  constructor(options: RedisRateLimiterOptions) {
    this.options = options;
  }

  private createRedisClient(): Redis {
    return new Redis(this.options.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => 3_000,
    });
  }

  private async initializeClient(): Promise<RedisRateLimiter | null> {
    const redis = this.createRedisClient();

    try {
      // Test connection
      await redis.connect();
      await redis.ping();

      this.nextRetryAt = 0;
      console.log("Redis rate limiter connected successfully");
      return new RedisRateLimiter(redis);
    } catch (error) {
      this.nextRetryAt = Date.now() + RedisRateLimitProvider.RETRY_BACKOFF_MS;
      redis.disconnect();
      console.error("Failed to connect to Redis for rate limiting:", error);
      return null;
    }
  }

  async getClient(): Promise<RateLimitClient | null> {
    if (this.client) {
      return this.client;
    }

    if (this.clientInitPromise) {
      return await this.clientInitPromise;
    }

    if (this.nextRetryAt > Date.now()) {
      return null;
    }

    const initPromise = this.initializeClient();
    this.clientInitPromise = initPromise;

    try {
      const client = await initPromise;
      this.client = client;
      return client;
    } finally {
      if (this.clientInitPromise === initPromise) {
        this.clientInitPromise = null;
      }
    }
  }
}
