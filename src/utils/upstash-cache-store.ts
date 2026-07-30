import { Redis } from '@upstash/redis';

/**
 * ⚠️ WARNING: CACHE-MANAGER COMPLIANCE PITFALL ⚠️
 * 
 * NestJS `CacheModule` relies on `cache-manager`. In `cache-manager` v5+, custom cache adapters 
 * require a very specific object shape and constructor format to be recognized properly.
 * 
 * If this `createUpstashStore` does not perfectly comply with the expected `CacheStore` interface, 
 * NestJS will silently ignore it and fallback to an IN-MEMORY cache. 
 * 
 * Be extremely careful about serialization and deserialization bugs! When objects fall back to the 
 * in-memory cache, they are passed by reference. Deserializers (like `EntitlementMap.fromJSON`) 
 * will receive LIVE class instances instead of JSON strings. 
 */
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
