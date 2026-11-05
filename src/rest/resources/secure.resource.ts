import {Controller, Get, Post, Request, UseGuard} from '@inversifyjs/http-core';
import {OasSecurity, OasSummary} from '@inversifyjs/http-open-api';
import type {Request as ExpressRequest} from 'express';
import {ApiConstants} from '../../constant/api.constants.js';
import {HmacGuard} from '../../security/hmac/hmac.guard.js';
import {JwtGuard} from '../../security/jwt/jwt.guard.js';
import {MtlsGuard} from '../../security/mtls/mtls.guard.js';
import {OAuth2Guard} from '../../security/oauth2/oauth2.guard.js';
import type {Principal} from '../../security/principal.js';
import {SsoGuard} from '../../security/sso/sso.guard.js';
import {ApiResponse} from '../dto/api-response.dto.js';

/** One endpoint per auth strategy. Copy the guard you need onto your own routes. */
@Controller(ApiConstants.API_SECURE)
export class SecureResource {
  @OasSummary('No auth')
  @Get('/public')
  public(): ApiResponse {
    return ApiResponse.ok('Public endpoint', null);
  }

  @OasSummary('Mutual TLS client certificate')
  @UseGuard(MtlsGuard)
  @Get('/mtls')
  mtls(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureResource.whoami(request);
  }

  @OasSummary('HMAC-SHA256 signed request')
  @OasSecurity({hmac: []})
  @UseGuard(HmacGuard)
  @Post('/hmac')
  hmac(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureResource.whoami(request);
  }

  @OasSummary('JWT issued by this service')
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Get('/jwt')
  jwt(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureResource.whoami(request);
  }

  @OasSummary('OAuth 2.0 access token from an external authorization server')
  @OasSecurity({oauth2: []})
  @UseGuard(OAuth2Guard)
  @Get('/oauth2')
  oauth2(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureResource.whoami(request);
  }

  @OasSummary('SSO session from OIDC or SAML')
  @UseGuard(SsoGuard)
  @Get('/sso')
  sso(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureResource.whoami(request);
  }

  private static whoami(request: ExpressRequest): ApiResponse<Principal> {
    return ApiResponse.ok('Authenticated', request.principal!);
  }
}
