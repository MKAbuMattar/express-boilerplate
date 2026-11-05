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

  async delete(...keys: string[]): Promise<void> {
    for (const key of keys) this.entries.delete(key);
  }
}
