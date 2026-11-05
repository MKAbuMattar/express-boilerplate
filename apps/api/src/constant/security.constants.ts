export class SecurityConstants {
  static readonly SESSION_COOKIE = 'session';
  static readonly SESSION_TTL_SECONDS = 8 * 60 * 60;
  static readonly OIDC_STATE_COOKIE = 'oidc_state';
  static readonly OIDC_STATE_TTL_MS = 10 * 60 * 1000;
  static readonly OIDC_SCOPE = 'openid profile email';
  static readonly JWT_ALGORITHM = 'HS256';
  static readonly JWT_DEFAULT_TTL = '1h';
  static readonly HMAC_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
  static readonly HMAC_CLIENT_ID_HEADER = 'x-client-id';
  static readonly HMAC_TIMESTAMP_HEADER = 'x-timestamp';
  static readonly HMAC_SIGNATURE_HEADER = 'x-signature';
  static readonly MIN_SECRET_LENGTH = 32;
}
