import type {HealthReport} from '../model/health.js';

/** Health groups: liveness, readiness, and all indicators. */
export type HealthGroup = 'liveness' | 'readiness' | 'all';

/** Contract for health checks. Abstract class, so it exists at runtime as a DI token. */
export abstract class HealthService {
  abstract health(group: HealthGroup): Promise<HealthReport>;
}
