import {createClient, createCluster} from 'redis';
import {CacheStore} from './cache-store.js';

type RedisConnection =
  | ReturnType<typeof createClient>
  | ReturnType<typeof createCluster>;

/**
 * Redis protocol store: Redis, Valkey, AWS ElastiCache and MemoryDB.
 * Use rediss:// for TLS (ElastiCache in-transit encryption) and
 * cluster=true for cluster-mode-enabled endpoints.
 */
export class RedisCacheStore extends CacheStore {
  readonly type = 'redis';
  private readonly connection: RedisConnection;

  constructor(url: string, cluster: boolean) {
    super();
    this.connection = cluster
      ? createCluster({rootNodes: [{url}], useReplicas: true})
      : createClient({url});
  }

  async connect(): Promise<void> {
    await this.connection.connect();
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  async get(key: string): Promise<string | null> {
    const value = await this.connection.get(key);
    return value === null ? null : String(value);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.connection.set(key, value, {
      expiration: {type: 'EX', value: ttlSeconds},
    });
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const reply = await this.connection.set(key, value, {
      expiration: {type: 'EX', value: ttlSeconds},
      condition: 'NX',
    });
    return reply !== null;
  }

  async increment(
    key: string,
    ttlSeconds: number,
  ): Promise<{count: number; resetSeconds: number}> {
    // One atomic round trip. EXPIRE NX sets the TTL only when the key has
    // none, so the window does not slide and a crash between commands can
    // never leave a counter that never expires.
    const [count, , ttl] = (await this.connection
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .ttl(key)
      .exec()) as unknown as [number, number, number];
    return {
      count: Number(count),
      resetSeconds: Number(ttl) > 0 ? Number(ttl) : ttlSeconds,
    };
  }

  async delete(...keys: string[]): Promise<void> {
    // One DEL per key: a multi-key DEL fails across cluster hash slots.
    await Promise.all(keys.map((key) => this.connection.del(key)));
  }
}
