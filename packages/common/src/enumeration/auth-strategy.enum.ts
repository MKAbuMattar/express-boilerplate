export enum AuthStrategy {
  // @feature:auth-mtls
  Mtls = 'mtls',
  // @end:auth-mtls
  // @feature:auth-hmac
  Hmac = 'hmac',
  // @end:auth-hmac
  Jwt = 'jwt',
  // @feature:auth-oauth2
  OAuth2 = 'oauth2',
  // @end:auth-oauth2
  // @feature:auth-oidc
  Oidc = 'oidc',
  // @end:auth-oidc
  // @feature:auth-saml
  Saml = 'saml',
  // @end:auth-saml
}
