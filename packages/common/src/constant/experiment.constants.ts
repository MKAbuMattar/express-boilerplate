export class ExperimentConstants {
  /** Anonymous visitor id, so a visitor keeps the same variant across requests. */
  static readonly SUBJECT_COOKIE = 'ab_id';
  static readonly SUBJECT_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
  static readonly VARIANT_HEADER = 'X-Experiment-Variant';
}
