import type { RedisClientType } from "redis";
import { createClient } from "redis";

import type {
  RateLimitClient,
  RateLimitConfig,
  RateLimitResult,
} from "@karakeep/shared/ratelimiting";
import { throttledLogger } from "@karakeep/shared/logger";
import { PluginProvider } from "@karakeep/shared/plugins";

const KEY_PREFIX = "ratelimit:v1";

const failOpenLog = throttledLogger(30_000);

export class RedisRateLimiter implements RateLimitClient {
  private redis: RedisClientType;

  constructor(redis: RedisClientType) {
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

      const result = await this.redis.eval(luaScript, {
        keys: [rateLimitKey, rateLimitSequenceKey],
        arguments: [
          now.toString(),
          config.windowMs.toString(),
          config.maxRequests.toString(),
        ],
      });

      if (!Array.isArray(result) || result.length < 2) {
        throw new Error("Unexpected Redis eval result");
      }

      const [allowed, resetInSeconds] = result.map((value) => Number(value));

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
      failOpenLog(
        "warn",
        `Rate limiter failed open due to Redis error: ${error}`,
      );
      return { allowed: true };
    }
  }

  async reset(config: RateLimitConfig, key: string) {
    const rateLimitKey = `${KEY_PREFIX}:${config.name}:${key}`;
    const rateLimitSequenceKey = `${rateLimitKey}:seq`;
    try {
      await this.redis.del([rateLimitKey, rateLimitSequenceKey]);
    } catch (error) {
      console.error("Redis rate limit reset error:", error);
    }
  }

  async clear() {
    try {
      let cursor = "0";
      do {
        const { cursor: nextCursor, keys } = await this.redis.scan(cursor, {
          MATCH: `${KEY_PREFIX}:*`,
          COUNT: 100,
        });
        cursor = nextCursor;
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      } while (cursor !== "0");
    } catch (error) {
      console.error("Redis rate limit clear error:", error);
    }
  }

  async disconnect() {
    if (this.redis.isOpen) {
      await this.redis.close();
    }
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

  private createRedisClient(): RedisClientType {
    return createClient({
      url: this.options.url,
      disableOfflineQueue: true,
      socket: {
        reconnectStrategy: () => 3_000,
      },
    });
  }

  private setupLifecycleHandlers(redis: RedisClientType): void {
    redis.on("ready", () => {
      this.nextRetryAt = 0;
    });

    // "end" fires when the client is permanently closed
    redis.on("end", () => {
      this.client = null;
      this.nextRetryAt = Date.now() + RedisRateLimitProvider.RETRY_BACKOFF_MS;
    });

    redis.on("error", (error) => {
      console.error("Redis rate limiter client error:", error);
    });
  }

  private async initializeClient(): Promise<RedisRateLimiter | null> {
    const redis = this.createRedisClient();
    this.setupLifecycleHandlers(redis);

    try {
      // Test connection
      await redis.connect();
      await redis.ping();

      this.nextRetryAt = 0;
      console.log("Redis rate limiter connected successfully");
      return new RedisRateLimiter(redis);
    } catch (error) {
      this.nextRetryAt = Date.now() + RedisRateLimitProvider.RETRY_BACKOFF_MS;
      redis.destroy();
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
