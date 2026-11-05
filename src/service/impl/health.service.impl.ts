import {inject} from 'inversify';
import {AppConfig} from '../../config/app.config.js';
import {Service} from '../../config/stereotypes.js';
import {ActuatorConstants} from '../../constant/actuator.constants.js';
import {HealthStatus} from '../../enumeration/health-status.enum.js';
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
 * Spring Boot Actuator health: runs a group's indicators in parallel, each
 * with a timeout, and reports DOWN (503) if any is down.
 *   liveness:  ping only, so a database outage never restarts pods
 *   readiness: db and cache, so traffic stops while they are unreachable
 *   all:       every indicator
 * Details (database type, latency, errors) are shown only when
 * HEALTH_SHOW_DETAILS=always, Spring's management.endpoint.health.show-details.
 */
@Service()
export class HealthServiceImpl extends HealthService {
  private readonly groups: Record<HealthGroup, HealthIndicator[]>;

  constructor(
    @inject(AppConfig) private readonly config: AppConfig,
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
    const ms = ActuatorConstants.INDICATOR_TIMEOUT_MS;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<Health>((resolve) => {
      timer = setTimeout(
        () => resolve(Health.down({error: `timed out after ${ms} ms`})),
        ms,
      );
    });
    try {
      return await Promise.race([indicator.check(), timeout]);
    } catch (error) {
      return Health.down({
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
