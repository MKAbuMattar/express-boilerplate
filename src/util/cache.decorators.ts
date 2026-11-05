import type {CacheService} from '../service/cache.service.js';

/** A class using @Cacheable or @CacheEvict injects CacheService as `cache`. */
export interface CacheAware {
  readonly cache: CacheService;
}

type KeyBuilder = (...args: any[]) => string;
type AsyncMethod = (this: CacheAware, ...args: any[]) => Promise<unknown>;

export class CacheDecorators {
  /** Spring @Cacheable: return the cached result, or run and cache it. */
  static cacheable(key: KeyBuilder, ttlSeconds?: number): MethodDecorator {
    return (_target, _name, descriptor: PropertyDescriptor) => {
      const original = descriptor.value as AsyncMethod;
      descriptor.value = function (this: CacheAware, ...args: unknown[]) {
        return this.cache.getOrLoad(
          key(...args),
          () => original.apply(this, args),
          ttlSeconds,
        );
      };
    };
  }

  /** Spring @CacheEvict: run the method, then drop the listed keys. */
  static cacheEvict(...keys: KeyBuilder[]): MethodDecorator {
    return (_target, _name, descriptor: PropertyDescriptor) => {
      const original = descriptor.value as AsyncMethod;
      descriptor.value = async function (this: CacheAware, ...args: unknown[]) {
        const result = await original.apply(this, args);
        await this.cache.evict(...keys.map((key) => key(...args)));
        return result;
      };
    };
  }
}

export const Cacheable = CacheDecorators.cacheable;
export const CacheEvict = CacheDecorators.cacheEvict;
