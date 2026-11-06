export enum CacheType {
  Memory = 'memory',
  // @feature:redis
  /** Redis protocol: Redis, Valkey, AWS ElastiCache, MemoryDB. */
  Redis = 'redis',
  // @end:redis
}
