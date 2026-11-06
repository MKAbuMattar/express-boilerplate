import {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {Service} from '@express-boilerplate/common/config/stereotypes.js';
import {ActuatorConstants} from '@express-boilerplate/common/constant/actuator.constants.js';
import {HealthStatus} from '@express-boilerplate/common/enumeration/health-status.enum.js';
import {Timeouts} from '@express-boilerplate/common/util/timeouts.js';
import {DataSource} from '@express-boilerplate/persistence/config/database.config.js';
import {inject} from 'inversify';
import {Health, HealthReport} from '../../model/health.js';
import {type HealthGroup, HealthService} from '../health.service.js';
import type {HealthIndicator} from '../health-indicator.js';
import {
  CacheHealthIndicator,
  DatabaseHealthIndicator,
  PingHealthIndicator,
  QueueHealthIndicator,
} from './health-indicators.js';

/**
 * Health: runs a group's indicators in parallel, each
 * with a timeout, and reports DOWN (503) if any is down.
 *   liveness:  ping only, so a database outage never restarts pods
 *   readiness: db and cache, so traffic stops while they are unreachable
 *   all:       every indicator
 * Details (database type, latency, errors) are shown only when
 * HEALTH_SHOW_DETAILS=always.
 */
@Service()
export class HealthServiceImpl extends HealthService {
  private readonly groups: Record<HealthGroup, HealthIndicator[]>;

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
    @inject(DataSource) private readonly dataSource: DataSource,
    @inject(PingHealthIndicator) ping: PingHealthIndicator,
    @inject(DatabaseHealthIndicator) db: DatabaseHealthIndicator,
    @inject(CacheHealthIndicator) cache: CacheHealthIndicator,
    @inject(QueueHealthIndicator) queue: QueueHealthIndicator,
  ) {
    super();
    this.groups = {
      liveness: [ping],
      readiness: [db, cache],
      all: [ping, db, cache, queue],
    };
  }

  get databaseUp(): boolean {
    return this.dataSource.isInitialized;
  }

  get databaseType(): string {
    return this.dataSource.options.type;
  }

  async health(group: HealthGroup): Promise<HealthReport> {
    const showDetails = this.config.env.HEALTH_SHOW_DETAILS === 'always';
    const results = await Promise.all(
      this.groups[group].map(
        async (indicator) =>
          [indicator.name, await HealthServiceImpl.run(indicator)] as const,
      ),
    );
    const components: HealthReport['components'] = {};
    for (const [name, health] of results) {
      components[name] = showDetails
        ? {status: health.status, details: health.details}
        : {status: health.status};
    }
    const down = results.some(
      ([, health]) => health.status !== HealthStatus.Up,
    );
    return new HealthReport(
      down ? HealthStatus.Down : HealthStatus.Up,
      components,
    );
  }

  /** Never throws and never waits past the timeout: a hung check is DOWN. */
  private static async run(indicator: HealthIndicator): Promise<Health> {
    try {
      return await Timeouts.within(
        indicator.check(),
        ActuatorConstants.INDICATOR_TIMEOUT_MS,
        'check',
      );
    } catch (error) {
      return Health.down({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
