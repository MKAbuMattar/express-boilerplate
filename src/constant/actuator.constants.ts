export class ActuatorConstants {
  /** Spring Boot's media type; also keeps DOWN bodies out of the problem-details rewrite. */
  static readonly MEDIA_TYPE = 'application/vnd.spring-boot.actuator.v3+json';
  /** A health check slower than this counts as DOWN. */
  static readonly INDICATOR_TIMEOUT_MS = 2000;
}
