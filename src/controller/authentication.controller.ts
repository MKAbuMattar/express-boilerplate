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
import {OasResponse, OasSecurity, OasSummary} from '@inversifyjs/http-open-api';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import {inject} from 'inversify';
import {ApiConstants} from '../constant/api.constants.js';
import {OpenApiConstants} from '../constant/openapi.constants.js';
import {SecurityConstants} from '../constant/security.constants.js';
import {ApiResponse} from '../rest/dto/api-response.dto.js';
import {JwtGuard} from '../security/jwt/jwt.guard.js';
import {TokenProvider} from '../security/jwt/token.provider.js';
import type {Principal} from '../security/principal.js';
import {OidcLoginState, OidcService} from '../security/sso/oidc.service.js';
import {SamlService} from '../security/sso/saml.service.js';
import {SessionService} from '../security/sso/session.service.js';
import {SsoGuard} from '../security/sso/sso.guard.js';

/** SSO entry points. Both OIDC and SAML end in the same session cookie. */
@Controller(ApiConstants.AUTH)
export class AuthenticationController {
  constructor(
    @inject(OidcService) private readonly oidcService: OidcService,
    @inject(SamlService) private readonly samlService: SamlService,
    @inject(SessionService) private readonly sessionService: SessionService,
    @inject(TokenProvider) private readonly tokenProvider: TokenProvider,
  ) {}

  @OasSummary('Start OIDC login (redirects to the IdP)')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('OIDC not configured'),
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

  @OasSummary('OIDC redirect URI')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Login failed'),
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

  @OasSummary('Start SAML login (redirects to the IdP)')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('SAML not configured'),
  )
  @Get(ApiConstants.AUTH_SAML_LOGIN)
  async samlLogin(@Response() response: ExpressResponse): Promise<void> {
    response.redirect(await this.samlService.createLoginUrl());
  }

  @OasSummary('SAML assertion consumer service (HTTP-POST)')
  @OasResponse(HttpStatusCode.FOUND, OpenApiConstants.REDIRECT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Invalid assertion'),
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

  @OasSummary('SAML service provider metadata')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.XML)
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('SAML not configured'),
  )
  @Get(ApiConstants.AUTH_SAML_METADATA)
  samlMetadata(@Response() response: ExpressResponse): void {
    response.type('application/xml').send(this.samlService.metadata());
  }

  @OasSummary('Current SSO session (OIDC or SAML)')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Authenticated principal'),
  )
  @OasResponse(HttpStatusCode.UNAUTHORIZED, OpenApiConstants.json('No session'))
  @UseGuard(SsoGuard)
  @Get(ApiConstants.AUTH_ME)
  me(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return ApiResponse.ok('Authenticated', request.principal!);
  }

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

  @OasSummary('Revoke the bearer JWT used for this call (API logout)')
  @OasSecurity({bearerAuth: []})
  @OasResponse(HttpStatusCode.NO_CONTENT, OpenApiConstants.NO_CONTENT)
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid JWT'),
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
