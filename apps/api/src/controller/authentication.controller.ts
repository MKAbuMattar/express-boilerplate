import {ApiConstants} from '@express-boilerplate/common/constant/api.constants.js';
import {OpenApiConstants} from '@express-boilerplate/common/constant/openapi.constants.js';
import {SecurityConstants} from '@express-boilerplate/common/constant/security.constants.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {JwtGuard} from '@express-boilerplate/common/security/jwt/jwt.guard.js';
import {TokenProvider} from '@express-boilerplate/common/security/jwt/token.provider.js';
import type {Principal} from '@express-boilerplate/common/security/principal.js';
import {
  OidcLoginState,
  OidcService,
} from '@express-boilerplate/common/security/sso/oidc.service.js';
import {SamlService} from '@express-boilerplate/common/security/sso/saml.service.js';
import {SessionService} from '@express-boilerplate/common/security/sso/session.service.js';
import {SsoGuard} from '@express-boilerplate/common/security/sso/sso.guard.js';
import {
  Body,
  Controller,
  Get,
  HttpStatusCode,
  NoContentHttpResponse,
  Post,
  Request,
  Response,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasResponse,
  OasSecurity,
  OasSummary,
  OasTag,
} from '@inversifyjs/http-open-api';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import {inject} from 'inversify';

/** SSO entry points. Both OIDC and SAML end in the same session cookie. */
@Controller(ApiConstants.AUTH)
export class AuthenticationController {
  constructor(
    // @feature:auth-oidc
    @inject(OidcService) private readonly oidcService: OidcService,
    // @end:auth-oidc
    // @feature:auth-saml
    @inject(SamlService) private readonly samlService: SamlService,
    // @end:auth-saml
    // @feature:sso
    @inject(SessionService) private readonly sessionService: SessionService,
    // @end:sso
    @inject(TokenProvider) private readonly tokenProvider: TokenProvider,
  ) {}

  // @feature:auth-oidc
  @OasTag('Authentication')

  @OasSummary('Start OIDC login (redirects to the IdP)')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.problem('OIDC not configured'),
  )
  @Get(ApiConstants.AUTH_OIDC_LOGIN)
  async oidcLogin(@Response() response: ExpressResponse): Promise<void> {
    const {url, loginState} = await this.oidcService.createLoginUrl();
    response.cookie(
      SecurityConstants.OIDC_STATE_COOKIE,
      JSON.stringify(loginState),
      {
        ...this.sessionService.cookieOptions,
        signed: true,
        maxAge: SecurityConstants.OIDC_STATE_TTL_MS,
      },
    );
    response.redirect(url.href);
  }
  // @end:auth-oidc

  // @feature:auth-oidc
  @OasTag('Authentication')

  @OasSummary('OIDC redirect URI')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Login failed'),
  )
  @Get(ApiConstants.AUTH_OIDC_CALLBACK)
  async oidcCallback(
    @Request() request: ExpressRequest,
    @Response() response: ExpressResponse,
  ): Promise<void> {
    const saved: unknown =
      request.signedCookies?.[SecurityConstants.OIDC_STATE_COOKIE];
    const parsed =
      typeof saved === 'string'
        ? (JSON.parse(saved) as OidcLoginState)
        : new OidcLoginState('', '', '');
    const currentUrl = new URL(
      request.originalUrl,
      this.oidcService.redirectUri,
    );
    const principal = await this.oidcService.handleCallback(
      currentUrl,
      new OidcLoginState(parsed.codeVerifier, parsed.state, parsed.nonce),
    );
    response.clearCookie(
      SecurityConstants.OIDC_STATE_COOKIE,
      this.sessionService.cookieOptions,
    );
    await this.sessionService.start(response, principal);
    response.redirect(ApiConstants.AUTH + ApiConstants.AUTH_ME);
  }
  // @end:auth-oidc

  // @feature:auth-saml
  @OasTag('Authentication')

  @OasSummary('Start SAML login (redirects to the IdP)')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.problem('SAML not configured'),
  )
  @Get(ApiConstants.AUTH_SAML_LOGIN)
  async samlLogin(@Response() response: ExpressResponse): Promise<void> {
    response.redirect(await this.samlService.createLoginUrl());
  }
  // @end:auth-saml

  // @feature:auth-saml
  @OasTag('Authentication')

  @OasSummary('SAML assertion consumer service (HTTP-POST)')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Invalid assertion'),
  )
  @Post(ApiConstants.AUTH_SAML_ACS)
  async samlAcs(
    @Body() body: Record<string, string>,
    @Response() response: ExpressResponse,
  ): Promise<void> {
    const principal = await this.samlService.handleAssertion(body);
    await this.sessionService.start(response, principal);
    response.redirect(ApiConstants.AUTH + ApiConstants.AUTH_ME);
  }
  // @end:auth-saml

  // @feature:auth-saml
  @OasTag('Authentication')

  @OasSummary('SAML service provider metadata')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.XML)
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.problem('SAML not configured'),
  )
  @Get(ApiConstants.AUTH_SAML_METADATA)
  samlMetadata(@Response() response: ExpressResponse): void {
    response.type('application/xml').send(this.samlService.metadata());
  }
  // @end:auth-saml

  // @feature:sso
  @OasTag('Authentication')

  @OasSummary('Current SSO session (OIDC or SAML)')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json(
      'Authenticated principal',
      OpenApiConstants.ref('Principal'),
    ),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('No session'),
  )
  @UseGuard(SsoGuard)
  @Get(ApiConstants.AUTH_ME)
  me(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return ApiResponse.ok('Authenticated', request.principal!);
  }
  // @end:sso

  // @feature:sso
  @OasTag('Authentication')

  @OasSummary('End the SSO session')
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @Post(ApiConstants.AUTH_LOGOUT)
  async logout(
    @Request() request: ExpressRequest,
    @Response() response: ExpressResponse,
  ): Promise<void> {
    await this.sessionService.end(request, response);
    response.status(204).end();
  }
  // @end:sso

  @OasTag('Authentication')

  @OasSummary('Revoke the bearer JWT used for this call (API logout)')
  @OasSecurity({bearerAuth: []})
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid JWT'),
  )
  @UseGuard(JwtGuard)
  @Post(ApiConstants.AUTH_TOKEN_REVOKE)
  async revokeToken(
    @Request() request: ExpressRequest,
  ): Promise<NoContentHttpResponse> {
    await this.tokenProvider.revoke(request.principal!.claims);
    return new NoContentHttpResponse();
  }
}
