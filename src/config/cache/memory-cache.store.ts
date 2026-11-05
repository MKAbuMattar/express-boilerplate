import {CacheStore} from './cache-store.js';

/**
 * Process-local cache for dev and tests.
 * shortcut: unbounded and per instance; use CACHE_TYPE=redis when you run
 * more than one instance or cache large sets.
 */
export class MemoryCacheStore extends CacheStore {
  readonly type = 'memory';
  private readonly entries = new Map<
    string,
    {value: string; expiresAt: number}
  >();

  async connect(): Promise<void> {}

  async close(): Promise<void> {
    this.entries.clear();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {value, expiresAt: Date.now() + ttlSeconds * 1000});
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }

  async increment(
    key: string,
    ttlSeconds: number,
  ): Promise<{count: number; resetSeconds: number}> {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.entries.set(key, {value: '1', expiresAt: now + ttlSeconds * 1000});
      return {count: 1, resetSeconds: ttlSeconds};
    }
    entry.value = String(Number(entry.value) + 1);
    return {
      count: Number(entry.value),
      resetSeconds: Math.ceil((entry.expiresAt - now) / 1000),
    };
  }

  async delete(...keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }
}
