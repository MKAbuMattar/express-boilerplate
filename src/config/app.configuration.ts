import {DataSource} from 'typeorm';
import {CacheType} from '../enumeration/cache-type.enum.js';
import {CacheService} from '../service/cache.service.js';
import {ExperimentService} from '../service/experiment.service.js';
import {HealthService} from '../service/health.service.js';
import {CacheServiceImpl} from '../service/impl/cache.service.impl.js';
import {ExperimentServiceImpl} from '../service/impl/experiment.service.impl.js';
import {HealthServiceImpl} from '../service/impl/health.service.impl.js';
import {MailServiceImpl} from '../service/impl/mail.service.impl.js';
import {NetworkServiceImpl} from '../service/impl/network.service.impl.js';
import {UserServiceImpl} from '../service/impl/user.service.impl.js';
import {MailService} from '../service/mail.service.js';
import {NetworkService} from '../service/network.service.js';
import {UserService} from '../service/user.service.js';
import {AppLogger} from '../util/app-logger.js';
import {AppConfig} from './app.config.js';
import {Bean, type BeanFactory, Configuration} from './bean-factory.js';
import {CacheStore} from './cache/cache-store.js';
import {MemoryCacheStore} from './cache/memory-cache.store.js';
import {RedisCacheStore} from './cache/redis-cache.store.js';
import {DatabaseConfig} from './database.config.js';
import {Metrics} from './observability/metrics.js';
import {BullMqQueueBroker} from './queue/bullmq-queue.broker.js';
import {MemoryQueueBroker} from './queue/memory-queue.broker.js';
import {QueueBroker} from './queue/queue-broker.js';

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

  @Bean(QueueBroker)
  queueBroker(beans: BeanFactory): QueueBroker {
    const {QUEUE_TYPE, QUEUE_URL, CACHE_URL, QUEUE_ATTEMPTS, QUEUE_BACKOFF_MS} =
      beans.getBean(AppConfig).env;
    if (QUEUE_TYPE === 'memory') {
      return new MemoryQueueBroker(QUEUE_ATTEMPTS, QUEUE_BACKOFF_MS);
    }
    const url = QUEUE_URL || CACHE_URL;
    if (!url) throw new Error('QUEUE_URL or CACHE_URL is required for bullmq');
    return new BullMqQueueBroker(url, QUEUE_ATTEMPTS, QUEUE_BACKOFF_MS);
  }

  // Service contracts to implementations, as Spring autowires an interface.
  @Bean(CacheService)
  cacheService(beans: BeanFactory): CacheService {
    return beans.getBean(CacheServiceImpl);
  }

  @Bean(ExperimentService)
  experimentService(beans: BeanFactory): ExperimentService {
    return beans.getBean(ExperimentServiceImpl);
  }

  @Bean(Metrics)
  metrics(): Metrics {
    return new Metrics();
  }

  @Bean(MailService)
  mailService(beans: BeanFactory): MailService {
    return beans.getBean(MailServiceImpl);
  }

  @Bean(HealthService)
  healthService(beans: BeanFactory): HealthService {
    return beans.getBean(HealthServiceImpl);
  }

  @Bean(NetworkService)
  networkService(beans: BeanFactory): NetworkService {
    return beans.getBean(NetworkServiceImpl);
  }

  @Bean(UserService)
  userService(beans: BeanFactory): UserService {
    return beans.getBean(UserServiceImpl);
  }
}
