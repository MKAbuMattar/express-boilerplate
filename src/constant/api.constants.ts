export class ApiConstants {
  static readonly AUTH = '/auth';
  static readonly AUTH_OIDC_LOGIN = '/oidc/login';
  static readonly AUTH_OIDC_CALLBACK = '/oidc/callback';
  static readonly AUTH_SAML_LOGIN = '/saml/login';
  static readonly AUTH_SAML_ACS = '/saml/acs';
  static readonly AUTH_SAML_METADATA = '/saml/metadata';
  static readonly AUTH_ME = '/me';
  static readonly AUTH_LOGOUT = '/logout';
  static readonly AUTH_TOKEN_REVOKE = '/token/revoke';
  static readonly WELL_KNOWN = '/.well-known';
  static readonly JWKS = '/jwks.json';

  /** Unversioned /api/* is rewritten to this version (see ApiVersioning). */
  static readonly DEFAULT_VERSION = 'v1';
  static readonly API_V1 = '/api/v1';
  static readonly API_V2 = '/api/v2';

  static readonly V1_HEALTH = `${ApiConstants.API_V1}/health`;
  static readonly V1_USERS = `${ApiConstants.API_V1}/users`;
  static readonly V1_SECURE = `${ApiConstants.API_V1}/secure`;
  static readonly V1_EXPERIMENTS = `${ApiConstants.API_V1}/experiments`;
  static readonly V1_EVENTS = `${ApiConstants.API_V1}/events`;
  static readonly V1_NETWORK = `${ApiConstants.API_V1}/network`;
  static readonly V1_QUEUES = `${ApiConstants.API_V1}/queues`;

  static readonly V2_USERS = `${ApiConstants.API_V2}/users`;

  static readonly DOCS = '/docs';
}
