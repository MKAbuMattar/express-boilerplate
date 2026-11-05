import {CacheType} from '../enumeration/cache-type.enum.js';
import {CacheService} from '../service/cache.service.js';
import {CacheServiceImpl} from '../service/impl/cache.service.impl.js';
import {AppLogger} from '../util/app-logger.js';
import {AppConfig} from './app.config.js';
import {Bean, type BeanFactory, Configuration} from './bean-factory.js';
import {CacheStore} from './cache/cache-store.js';
import {MemoryCacheStore} from './cache/memory-cache.store.js';
import {RedisCacheStore} from './cache/redis-cache.store.js';
import {Metrics} from './observability/metrics.js';
import {BullMqQueueBroker} from './queue/bullmq-queue.broker.js';
import {MemoryQueueBroker} from './queue/memory-queue.broker.js';
import {QueueBroker} from './queue/queue-broker.js';

/** Cross-cutting beans: logger, cache, queue, metrics. */
@Configuration()
export class CommonConfiguration {
  @Bean(AppLogger)
  appLogger(beans: BeanFactory): AppLogger {
    return new AppLogger(beans.getBean(AppConfig));
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

  @Bean(CacheService)
  cacheService(beans: BeanFactory): CacheService {
    return beans.getBean(CacheServiceImpl);
  }

  @Bean(Metrics)
  metrics(): Metrics {
    return new Metrics();
  }
}
