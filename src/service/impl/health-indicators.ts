import {inject} from 'inversify';
import {DataSource} from 'typeorm';
import {CacheStore} from '../../config/cache/cache-store.js';
import {QueueBroker} from '../../config/queue/queue-broker.js';
import {Component} from '../../config/stereotypes.js';
import {Health} from '../../model/health.js';
import {HealthIndicator} from '../health-indicator.js';

/** The process answers. The only liveness check: no dependencies. */
@Component()
export class PingHealthIndicator extends HealthIndicator {
  readonly name = 'ping';

  async check(): Promise<Health> {
    return Health.up();
  }
}

/** A round trip to the database: SELECT 1, or ping on MongoDB. */
@Component()
export class DatabaseHealthIndicator extends HealthIndicator {
  readonly name = 'db';

  constructor(@inject(DataSource) private readonly dataSource: DataSource) {
    super();
  }

  async check(): Promise<Health> {
    const database = this.dataSource.options.type;
    if (!this.dataSource.isInitialized) {
      return Health.down({database, error: 'not connected'});
    }
    const started = performance.now();
    if (database === 'mongodb') {
      // TypeORM types the Mongo query runner loosely; its connection is a MongoClient.
      const client = (
        this.dataSource.mongoManager.queryRunner as unknown as {
          databaseConnection: {db(): {command(c: object): Promise<unknown>}};
        }
      ).databaseConnection;
      await client.db().command({ping: 1});
    } else {
      await this.dataSource.query('SELECT 1');
    }
    return Health.up({
      database,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}

/** A read from the cache store (Redis/Valkey/ElastiCache, or memory). */
@Component()
export class CacheHealthIndicator extends HealthIndicator {
  readonly name = 'cache';

  constructor(@inject(CacheStore) private readonly store: CacheStore) {
    super();
  }

  async check(): Promise<Health> {
    const started = performance.now();
    await this.store.get('health:probe');
    return Health.up({
      type: this.store.type,
      latencyMs: Math.round(performance.now() - started),
    });
  }
}

/** Which queue broker is wired; its connection is the cache's Redis. */
@Component()
export class QueueHealthIndicator extends HealthIndicator {
  readonly name = 'queue';

  constructor(@inject(QueueBroker) private readonly broker: QueueBroker) {
    super();
  }

  async check(): Promise<Health> {
    return Health.up({type: this.broker.type});
  }
}
