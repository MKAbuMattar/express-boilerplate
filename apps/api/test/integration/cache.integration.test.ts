import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import type {Application} from '../../src/application.js';
import {UserRepository} from '../../src/repository/user.repository.js';
import {CreateUserDto} from '../../src/rest/dto/create-user.dto.js';
import {CacheService} from '../../src/service/cache.service.js';
import {UserService} from '../../src/service/user.service.js';
import {TestApp} from '../support/test-app.js';

describe('@Cacheable / @CacheEvict on UserService', () => {
  let application: Application;
  let users: UserService;
  let repository: UserRepository;

  beforeAll(async () => {
    ({application} = await TestApp.create());
    users = application.beans.getBean(UserService);
    repository = application.beans.getBean(UserRepository);
  });
  afterAll(() => application.close());

  it('serves findAll from cache until a write evicts it', async () => {
    const spy = vi.spyOn(repository, 'findAll');
    await users.findAll();
    await users.findAll();
    expect(spy).toHaveBeenCalledTimes(1);

    await users.create(
      CreateUserDto.from({name: 'C', email: 'c@example.com', age: 1}),
    );
    expect(await users.findAll()).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('prefixes keys with CACHE_PREFIX', async () => {
    const cache = application.beans.getBean(CacheService);
    await cache.set('x', {a: 1});
    expect(await cache.get('x')).toEqual({a: 1});
  });
});
