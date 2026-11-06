export class ActuatorConstants {
  /**
   * Plain JSON. Health bodies are sent with res.send, so a DOWN (503) body
   * keeps its components instead of being rewritten as problem details.
   */
  static readonly MEDIA_TYPE = 'application/json';
  /** A health check slower than this counts as DOWN. */
  static readonly INDICATOR_TIMEOUT_MS = 2000;
}
