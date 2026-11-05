import {MemoryCacheStore} from '@express-boilerplate/common/config/cache/memory-cache.store.js';
import type {CacheService} from '@express-boilerplate/common/service/cache.service.js';
import {CacheServiceImpl} from '@express-boilerplate/common/service/impl/cache.service.impl.js';
import {AppLogger} from '@express-boilerplate/common/util/app-logger.js';
import {
  Cacheable,
  CacheEvict,
} from '@express-boilerplate/common/util/cache.decorators.js';
import {describe, expect, it, vi} from 'vitest';
import {UnitFixtures} from '../support/unit-fixtures.js';

class Greeter {
  calls = 0;
  constructor(readonly cache: CacheService) {}

  @Cacheable((name: string) => `greet:${name}`)
  async greet(name: string): Promise<string> {
    this.calls++;
    return `hello ${name}`;
  }

  @CacheEvict((name: string) => `greet:${name}`)
  async rename(_name: string): Promise<void> {}

  @CacheEvict((name: string) => `greet:${name}`)
  async fail(_name: string): Promise<void> {
    throw new Error('boom');
  }
}

describe('@Cacheable / @CacheEvict', () => {
  const build = () => {
    const config = UnitFixtures.config();
    return new Greeter(
      new CacheServiceImpl(
        new MemoryCacheStore(),
        config,
        new AppLogger(config),
      ),
    );
  };

  it('caches per key and keeps `this`', async () => {
    const greeter = build();
    expect(await greeter.greet('a')).toBe('hello a');
    expect(await greeter.greet('a')).toBe('hello a');
    expect(await greeter.greet('b')).toBe('hello b');
    expect(greeter.calls).toBe(2);
  });

  it('evicts after the method succeeds', async () => {
    const greeter = build();
    await greeter.greet('a');
    await greeter.rename('a');
    await greeter.greet('a');
    expect(greeter.calls).toBe(2);
  });

  it('does not evict when the method throws', async () => {
    const greeter = build();
    await greeter.greet('a');
    const evict = vi.spyOn(greeter.cache, 'evict');
    await expect(greeter.fail('a')).rejects.toThrow('boom');
    expect(evict).not.toHaveBeenCalled();
  });
});
