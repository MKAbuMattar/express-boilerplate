import {HealthStatus} from '@express-boilerplate/common/enumeration/health-status.enum.js';

/** One component's health, as Actuator reports it. */
export class Health {
  constructor(
    readonly status: HealthStatus,
    readonly details: Record<string, unknown> = {},
  ) {}

  static up(details: Record<string, unknown> = {}): Health {
    return new Health(HealthStatus.Up, details);
  }

  static down(details: Record<string, unknown> = {}): Health {
    return new Health(HealthStatus.Down, details);
  }
}

/** The aggregated answer of a health group. */
export class HealthReport {
  constructor(
    readonly status: HealthStatus,
    readonly components: Record<
      string,
      {status: HealthStatus; details?: Record<string, unknown>}
    >,
  ) {}

  get httpStatus(): number {
    return this.status === HealthStatus.Up ? 200 : 503;
  }
}
