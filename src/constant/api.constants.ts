export class ApiConstants {
  static readonly AUTH = '/auth';
  static readonly AUTH_OIDC_LOGIN = '/oidc/login';
  static readonly AUTH_OIDC_CALLBACK = '/oidc/callback';
  static readonly AUTH_SAML_LOGIN = '/saml/login';
  static readonly AUTH_SAML_ACS = '/saml/acs';
  static readonly AUTH_SAML_METADATA = '/saml/metadata';
  static readonly AUTH_ME = '/me';
  static readonly AUTH_LOGOUT = '/logout';

  static readonly API_HEALTH = '/api/health';
  static readonly API_USERS = '/api/users';
  static readonly API_SECURE = '/api/secure';
  static readonly API_EXPERIMENTS = '/api/experiments';

  static readonly DOCS = '/docs';
}
