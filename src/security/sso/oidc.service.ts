import {ServiceUnavailableHttpResponse} from '@inversifyjs/http-core';
import {inject} from 'inversify';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  type Configuration,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import {AppConfig} from '../../config/app.config.js';
import {Component} from '../../config/stereotypes.js';
import {ApiConstants} from '../../constant/api.constants.js';
import {SecurityConstants} from '../../constant/security.constants.js';
import {AuthStrategy} from '../../enumeration/auth-strategy.enum.js';
import {AuthException} from '../../exceptions/auth.exception.js';
import {ApiResponse} from '../../rest/dto/api-response.dto.js';
import {Principal} from '../principal.js';

export class OidcLoginState {
  constructor(
    readonly codeVerifier: string,
    readonly state: string,
    /** Binds the id_token to this login, so a stolen one cannot be replayed. */
    readonly nonce: string,
  ) {}
}

/** OpenID Connect authorization code flow with PKCE. */
@Component()
export class OidcService {
  private configuration?: Promise<Configuration>;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  get redirectUri(): string {
    return new URL(
      ApiConstants.AUTH + ApiConstants.AUTH_OIDC_CALLBACK,
      this.config.env.PUBLIC_URL,
    ).href;
  }

  async createLoginUrl(): Promise<{url: URL; loginState: OidcLoginState}> {
    const configuration = await this.discover();
    const loginState = new OidcLoginState(
      randomPKCECodeVerifier(),
      randomState(),
      randomNonce(),
    );
    const url = buildAuthorizationUrl(configuration, {
      redirect_uri: this.redirectUri,
      scope: SecurityConstants.OIDC_SCOPE,
      code_challenge: await calculatePKCECodeChallenge(loginState.codeVerifier),
      code_challenge_method: 'S256',
      state: loginState.state,
      nonce: loginState.nonce,
    });
    return {url, loginState};
  }

  async handleCallback(
    currentUrl: URL,
    loginState: OidcLoginState,
  ): Promise<Principal> {
    const configuration = await this.discover();
    let tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>;
    try {
      tokens = await authorizationCodeGrant(configuration, currentUrl, {
        pkceCodeVerifier: loginState.codeVerifier,
        expectedState: loginState.state,
        expectedNonce: loginState.nonce,
      });
    } catch {
      // Bad state, code, PKCE verifier or id_token: a failed login, not a 500.
      throw AuthException.unauthorized(AuthStrategy.Oidc, 'login failed');
    }
    const claims = tokens.claims();
    if (!claims) {
      throw AuthException.unauthorized(AuthStrategy.Oidc, 'no id_token');
    }
    return new Principal(AuthStrategy.Oidc, claims.sub, {
      email: claims.email,
      name: claims.name,
    });
  }

  private discover(): Promise<Configuration> {
    const {OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET} = this.config.env;
    if (!OIDC_ISSUER || !OIDC_CLIENT_ID) {
      throw AuthException.notConfigured(AuthStrategy.Oidc);
    }
    this.configuration ??= discovery(
      new URL(OIDC_ISSUER),
      OIDC_CLIENT_ID,
      OIDC_CLIENT_SECRET,
    ).catch(() => {
      this.configuration = undefined; // retry discovery on the next login
      throw new ServiceUnavailableHttpResponse(
        ApiResponse.fail('Identity provider unavailable, retry later'),
      );
    });
    return this.configuration;
  }
}
