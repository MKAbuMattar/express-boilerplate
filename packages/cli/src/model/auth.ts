export type AuthKind = 'jwt' | 'mtls' | 'hmac' | 'oauth2' | 'sso';

/** What a generated route needs for one authentication method. */
export type AuthSpec = {
  kind: AuthKind;
  guard: string;
  /** Module under packages/common/src, without extension. */
  module: string;
  /** OpenAPI security scheme name (OpenApiConfig.securitySchemes). */
  scheme: string;
  /** The feature that ships the guard; null when it is core. */
  feature: string | null;
  label: string;
};

export class Auths {
  static readonly SPECS: Readonly<Record<AuthKind, AuthSpec>> = {
    jwt: {
      kind: 'jwt',
      guard: 'JwtGuard',
      module: 'security/jwt/jwt.guard',
      scheme: 'bearerAuth',
      feature: null,
      label: 'JWT',
    },
    mtls: {
      kind: 'mtls',
      guard: 'MtlsGuard',
      module: 'security/mtls/mtls.guard',
      scheme: 'mutualTLS',
      feature: 'auth-mtls',
      label: 'mTLS',
    },
    hmac: {
      kind: 'hmac',
      guard: 'HmacGuard',
      module: 'security/hmac/hmac.guard',
      scheme: 'hmac',
      feature: 'auth-hmac',
      label: 'HMAC',
    },
    oauth2: {
      kind: 'oauth2',
      guard: 'OAuth2Guard',
      module: 'security/oauth2/oauth2.guard',
      scheme: 'oauth2',
      feature: 'auth-oauth2',
      label: 'OAuth 2.0',
    },
    sso: {
      kind: 'sso',
      guard: 'SsoGuard',
      module: 'security/sso/sso.guard',
      scheme: 'session',
      feature: 'sso',
      label: 'SSO session',
    },
  };

  static parse(value: string | undefined): AuthSpec {
    const kind = (value ?? 'jwt').toLowerCase();
    const spec = Auths.SPECS[kind as AuthKind];
    if (!spec) {
      throw new Error(`--auth must be ${Object.keys(Auths.SPECS).join(', ')}`);
    }
    return spec;
  }
}
