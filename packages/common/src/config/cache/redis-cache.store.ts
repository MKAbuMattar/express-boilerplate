import {Cluster, Redis} from 'ioredis';
import {CacheStore} from './cache-store.js';

/**
 * Redis protocol store: Redis, Valkey, AWS ElastiCache and MemoryDB.
 * Use rediss:// for TLS (ElastiCache in-transit encryption) and
 * cluster=true for cluster-mode-enabled endpoints. ioredis, the client
 * BullMQ already uses, so the app has one Redis client, not two.
 */
export class RedisCacheStore extends CacheStore {
  readonly type = 'redis';
  private readonly connection: Redis | Cluster;

  constructor(url: string, cluster: boolean) {
    super();
    this.connection = cluster
      ? RedisCacheStore.cluster(new URL(url))
      : new Redis(url, {lazyConnect: true});
  }

  /** A cluster takes its seed node and credentials apart, not as a URL. */
  private static cluster(url: URL): Cluster {
    return new Cluster([{host: url.hostname, port: Number(url.port || 6379)}], {
      lazyConnect: true,
      scaleReads: 'slave',
      redisOptions: {
        username: decodeURIComponent(url.username) || undefined,
        password: decodeURIComponent(url.password) || undefined,
        tls: url.protocol === 'rediss:' ? {} : undefined,
      },
    });
  }

  async connect(): Promise<void> {
    await this.connection.connect();
  }

  async close(): Promise<void> {
    await this.connection.quit();
  }

  async get(key: string): Promise<string | null> {
    return this.connection.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.connection.set(key, value, 'EX', ttlSeconds);
  }

  async setIfAbsent(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    return (
      (await this.connection.set(key, value, 'EX', ttlSeconds, 'NX')) !== null
    );
  }

  async increment(
    key: string,
    ttlSeconds: number,
  ): Promise<{count: number; resetSeconds: number}> {
    // One atomic round trip. EXPIRE NX sets the TTL only when the key has
    // none, so the window does not slide and a crash between commands can
    // never leave a counter that never expires.
    const replies = await this.connection
      .multi()
      .incr(key)
      .expire(key, ttlSeconds, 'NX')
      .ttl(key)
      .exec();
    const [count, , ttl] = (replies ?? []).map(([error, value]) => {
      if (error) throw error;
      return Number(value);
    });
    return {
      count: count ?? 0,
      resetSeconds: (ttl ?? 0) > 0 ? (ttl as number) : ttlSeconds,
    };
  }

  async delete(...keys: string[]): Promise<void> {
    // One DEL per key: a multi-key DEL fails across cluster hash slots.
    await Promise.all(keys.map((key) => this.connection.del(key)));
  }
}
