/** Contract for cache-aside caching. Abstract class, so it exists at runtime as a DI token. */
export abstract class CacheService {
  abstract readonly type: string;
  abstract get<T>(key: string): Promise<T | null>;
  abstract set(key: string, value: unknown, ttlSeconds?: number): Promise<void>;
  abstract setIfAbsent(key: string, ttlSeconds?: number): Promise<boolean>;
  abstract evict(...keys: string[]): Promise<void>;
  abstract getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T>;
}
