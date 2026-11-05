import {DataSource} from 'typeorm';
import {CacheType} from '../enumeration/cache-type.enum.js';
import {CacheService} from '../service/cache.service.js';
import {CacheServiceImpl} from '../service/impl/cache.service.impl.js';
import {UserServiceImpl} from '../service/impl/user.service.impl.js';
import {UserService} from '../service/user.service.js';
import {AppLogger} from '../util/app-logger.js';
import {AppConfig} from './app.config.js';
import {Bean, type BeanFactory, Configuration} from './bean-factory.js';
import {CacheStore} from './cache/cache-store.js';
import {MemoryCacheStore} from './cache/memory-cache.store.js';
import {RedisCacheStore} from './cache/redis-cache.store.js';
import {DatabaseConfig} from './database.config.js';

@Configuration()
export class AppConfiguration {
  @Bean(AppLogger)
  appLogger(beans: BeanFactory): AppLogger {
    return new AppLogger(beans.getBean(AppConfig));
  }

  @Bean(DataSource)
  dataSource(beans: BeanFactory): DataSource {
    return DatabaseConfig.createDataSource(beans.getBean(AppConfig));
  }

  @Bean(CacheStore)
  cacheStore(beans: BeanFactory): CacheStore {
    const {CACHE_TYPE, CACHE_URL, CACHE_CLUSTER} = beans.getBean(AppConfig).env;
    if (CACHE_TYPE === CacheType.Memory) return new MemoryCacheStore();
    if (!CACHE_URL) {
      throw new Error('CACHE_URL is required when CACHE_TYPE=redis');
    }
    return new RedisCacheStore(CACHE_URL, CACHE_CLUSTER);
  }

  // Service contracts to implementations, as Spring autowires an interface.
  @Bean(CacheService)
  cacheService(beans: BeanFactory): CacheService {
    return beans.getBean(CacheServiceImpl);
  }

  @Bean(UserService)
  userService(beans: BeanFactory): UserService {
    return beans.getBean(UserServiceImpl);
  }
}
