import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {CacheStore} from '../../config/cache/cache-store.js';
import {Service} from '../../config/stereotypes.js';
import {AppLogger} from '../../util/app-logger.js';
import {Timeouts} from '../../util/timeouts.js';
import {CacheService} from '../cache.service.js';

/**
 * Cache-aside over a CacheStore. Values round-trip through JSON, so a cached
 * Date comes back as an ISO string; converters accept both.
 *
 * Reads and writes fail open: a cache that errors or exceeds CACHE_TIMEOUT_MS
 * counts as a miss, so a cache outage slows requests but never fails them.
 * setIfAbsent does not fail open; its callers decide (HmacGuard fails closed).
 */
@Service()
export class CacheServiceImpl extends CacheService {
  constructor(
    @inject(CacheStore) private readonly store: CacheStore,
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(AppLogger) private readonly appLogger: AppLogger,
  ) {
    super();
  }

  get type(): string {
    return this.store.type;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.safely('get', () => this.store.get(this.key(key)));
    return raw === null || raw === undefined ? null : (JSON.parse(raw) as T);
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<void> {
    await this.safely('set', () =>
      this.store.set(this.key(key), JSON.stringify(value), ttlSeconds),
    );
  }

  async setIfAbsent(
    key: string,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<boolean> {
    return this.withTimeout(
      this.store.setIfAbsent(this.key(key), '1', ttlSeconds),
    );
  }

  async evict(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // A failed evict leaves stale data until the TTL expires; it is logged.
    await this.safely('evict', () =>
      this.store.delete(...keys.map((key) => this.key(key))),
    );
  }

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    if (value !== null && value !== undefined) {
      await this.set(key, value, ttlSeconds);
    }
    return value;
  }

  private async safely<R>(
    operation: string,
    action: () => Promise<R>,
  ): Promise<R | undefined> {
    try {
      return await this.withTimeout(action());
    } catch (error) {
      this.appLogger.logger.warn(
        {err: error, operation},
        'Cache unavailable, continuing without it',
      );
      return undefined;
    }
  }

  private withTimeout<R>(promise: Promise<R>): Promise<R> {
    return Timeouts.within(promise, this.config.env.CACHE_TIMEOUT_MS, 'cache');
  }

  private get defaultTtl(): number {
    return this.config.env.CACHE_TTL_SECONDS;
  }

  private key(key: string): string {
    return `${this.config.env.CACHE_PREFIX}${key}`;
  }
}
