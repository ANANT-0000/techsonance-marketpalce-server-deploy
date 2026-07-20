import { Redis } from '@upstash/redis';

export function createUpstashStore(redis: Redis) {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const val = await redis.get<T>(key);
      if (val === null) return undefined;
      return val;
    },
    async set<T>(key: string, data: T, ttl?: number): Promise<void> {
      if (ttl) {
        // ttl in cache-manager v5 is expected in milliseconds.
        await redis.set(key, data, { px: ttl });
      } else {
        await redis.set(key, data);
      }
    },
    async del(key: string): Promise<void> {
      await redis.del(key);
    },
    async reset(): Promise<void> {
      await redis.flushdb();
    },
    async mset(args: [string, unknown][], ttl?: number): Promise<void> {
      const pipeline = redis.pipeline();
      for (const [k, v] of args) {
        if (ttl) pipeline.set(k, v, { px: ttl });
        else pipeline.set(k, v);
      }
      await pipeline.exec();
    },
    async mget(...args: string[]): Promise<unknown[]> {
      if (args.length === 0) return [];
      return await redis.mget(...args);
    },
    async mdel(...args: string[]): Promise<void> {
      if (args.length === 0) return;
      await redis.del(...args);
    },
    async keys(pattern: string = '*'): Promise<string[]> {
      return await redis.keys(pattern);
    },
    async ttl(key: string): Promise<number> {
      return await redis.pttl(key);
    },
  };
}
