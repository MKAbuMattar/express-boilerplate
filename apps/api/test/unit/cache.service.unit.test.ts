import {describe, expect, it, vi} from 'vitest';
import {MemoryCacheStore} from '../../src/config/cache/memory-cache.store.js';
import {CacheServiceImpl} from '../../src/service/impl/cache.service.impl.js';
import {AppLogger} from '../../src/util/app-logger.js';
import {UnitFixtures} from '../support/unit-fixtures.js';

describe('CacheServiceImpl', () => {
  const build = (store = new MemoryCacheStore(), env = {}) => {
    const config = UnitFixtures.config({
      CACHE_PREFIX: 't:',
      CACHE_TIMEOUT_MS: '50',
      ...env,
    });
    return {
      store,
      cache: new CacheServiceImpl(store, config, new AppLogger(config)),
    };
  };

  it('prefixes keys and round-trips JSON', async () => {
    const {store, cache} = build();
    await cache.set('k', {a: 1});
    expect(await store.get('t:k')).toBe('{"a":1}');
    expect(await cache.get('k')).toEqual({a: 1});
  });

  it('getOrLoad loads once, then serves from cache', async () => {
    const {cache} = build();
    const loader = vi.fn(async () => ({n: 1}));
    expect(await cache.getOrLoad('k', loader)).toEqual({n: 1});
    expect(await cache.getOrLoad('k', loader)).toEqual({n: 1});
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does not cache null results', async () => {
    const {cache} = build();
    const loader = vi.fn(async () => null);
    await cache.getOrLoad('k', loader);
    await cache.getOrLoad('k', loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('fails open when the store throws', async () => {
    const {store, cache} = build();
    vi.spyOn(store, 'get').mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(store, 'set').mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(store, 'delete').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await cache.getOrLoad('k', async () => 'fresh')).toBe('fresh');
    await expect(cache.evict('k')).resolves.toBeUndefined();
  });

  it('treats a slow store as a miss after CACHE_TIMEOUT_MS', async () => {
    const {store, cache} = build();
    vi.spyOn(store, 'get').mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    expect(await cache.getOrLoad('k', async () => 'fresh')).toBe('fresh');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('lets setIfAbsent errors reach the caller (no fail-open)', async () => {
    const {store, cache} = build();
    vi.spyOn(store, 'setIfAbsent').mockRejectedValue(new Error('down'));
    await expect(cache.setIfAbsent('n')).rejects.toThrow('down');
  });
});
