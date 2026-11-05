import type {Health} from '../model/health.js';

/**
 * One dependency, one check. Add one by
 * extending this class (see service/impl/health-indicators.ts) and listing it
 * in a group of HealthServiceImpl.
 */
export abstract class HealthIndicator {
  /** Component name in the response (db, cache, ...). */
  abstract readonly name: string;
  abstract check(): Promise<Health>;
}
