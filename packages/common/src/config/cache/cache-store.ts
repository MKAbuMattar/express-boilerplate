/** Storage behind CacheService. Values are already-serialized strings. */
export abstract class CacheStore {
  abstract readonly type: string;
  abstract connect(): Promise<void>;
  abstract close(): Promise<void>;
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Atomic set-if-missing. Returns false when the key already existed. */
  abstract setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  abstract delete(...keys: string[]): Promise<void>;
  /**
   * Atomic counter. The first increment starts a TTL of ttlSeconds; returns
   * the new count and the seconds left before the counter resets.
   */
  abstract increment(
    key: string,
    ttlSeconds: number,
  ): Promise<{count: number; resetSeconds: number}>;
}
