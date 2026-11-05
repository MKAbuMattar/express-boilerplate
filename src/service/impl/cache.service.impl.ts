import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {CacheStore} from '../../config/cache/cache-store.js';
import {Service} from '../../config/stereotypes.js';
import {CacheService} from '../cache.service.js';

/**
 * Cache-aside over a CacheStore. Values round-trip through JSON, so a cached
 * Date comes back as an ISO string; converters accept both.
 */
@Service()
export class CacheServiceImpl extends CacheService {
  constructor(
    @inject(CacheStore) private readonly store: CacheStore,
    @inject(AppConfig) private readonly config: AppConfig,
  ) {
    super();
  }

  get type(): string {
    return this.store.type;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.store.get(this.key(key));
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<void> {
    await this.store.set(this.key(key), JSON.stringify(value), ttlSeconds);
  }

  async setIfAbsent(
    key: string,
    ttlSeconds: number = this.defaultTtl,
  ): Promise<boolean> {
    return this.store.setIfAbsent(this.key(key), '1', ttlSeconds);
  }

  async evict(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.store.delete(...keys.map((key) => this.key(key)));
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

  private get defaultTtl(): number {
    return this.config.env.CACHE_TTL_SECONDS;
  }

  private key(key: string): string {
    return `${this.config.env.CACHE_PREFIX}${key}`;
  }
}
