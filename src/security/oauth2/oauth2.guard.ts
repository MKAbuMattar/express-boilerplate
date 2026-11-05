import type {ExpressGuard} from '@inversifyjs/http-express';
import type {Request} from 'express';
import {inject} from 'inversify';
import {createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify} from 'jose';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {Principal} from '../principal.js';

/**
 * OAuth 2.0 resource server: validates JWT access tokens from an external
 * authorization server (Keycloak, Auth0, Entra ID, Okta) against its JWKS.
 */
@Component()
export class OAuth2Guard implements ExpressGuard {
  private jwks?: JWTVerifyGetKey;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  async activate(request: Request): Promise<boolean> {
    const {OAUTH2_ISSUER, OAUTH2_AUDIENCE, OAUTH2_JWKS_URI} = this.config.env;
    if (!OAUTH2_ISSUER || !OAUTH2_AUDIENCE || !OAUTH2_JWKS_URI) {
      throw AuthException.notConfigured(AuthStrategy.OAuth2);
    }
    const token = AuthException.bearerToken(request, AuthStrategy.OAuth2);
    this.jwks ??= createRemoteJWKSet(new URL(OAUTH2_JWKS_URI));
    try {
      const {payload} = await jwtVerify(token, this.jwks, {
        issuer: OAUTH2_ISSUER,
        audience: OAUTH2_AUDIENCE,
      });
      request.principal = new Principal(
        AuthStrategy.OAuth2,
        payload.sub ?? '',
        payload,
      );
      return true;
    } catch {
      throw AuthException.unauthorized(
        AuthStrategy.OAuth2,
        'invalid or expired access token',
      );
    }
  }
}
