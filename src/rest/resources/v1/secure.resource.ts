import {
  Controller,
  Get,
  HttpStatusCode,
  Post,
  Request,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasParameter,
  OasRequestBody,
  OasResponse,
  OasSecurity,
  OasSummary,
} from '@inversifyjs/http-open-api';
import type {Request as ExpressRequest} from 'express';
import {ApiConstants} from '../../../constant/api.constants.js';
import {OpenApiConstants} from '../../../constant/openapi.constants.js';
import {HmacGuard} from '../../../security/hmac/hmac.guard.js';
import {JwtGuard} from '../../../security/jwt/jwt.guard.js';
import {MtlsGuard} from '../../../security/mtls/mtls.guard.js';
import {OAuth2Guard} from '../../../security/oauth2/oauth2.guard.js';
import type {Principal} from '../../../security/principal.js';
import {SsoGuard} from '../../../security/sso/sso.guard.js';
import {ApiResponse} from '../../dto/api-response.dto.js';

/** One endpoint per auth strategy. Copy the guard you need onto your own routes. */
@Controller(ApiConstants.V1_SECURE)
export class SecureV1Resource {
  @OasSummary('No auth')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Public endpoint'))
  @Get('/public')
  public(): ApiResponse {
    return ApiResponse.ok('Public endpoint', null);
  }

  @OasSummary('Mutual TLS client certificate')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Authenticated principal'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid credentials'),
  )
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('Strategy not configured'),
  )
  @UseGuard(MtlsGuard)
  @Get('/mtls')
  mtls(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }

  @OasSummary('HMAC-SHA256 signed request')
  @OasParameter(
    OpenApiConstants.header('X-Client-Id', 'Client id from HMAC_CLIENTS'),
  )
  @OasParameter(OpenApiConstants.header('X-Timestamp', 'Unix seconds'))
  @OasParameter(
    OpenApiConstants.header('X-Signature', 'hex HMAC-SHA256, see README'),
  )
  @OasRequestBody(OpenApiConstants.ANY_JSON_BODY)
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Authenticated principal'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid credentials'),
  )
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('Strategy not configured'),
  )
  @OasSecurity({hmac: []})
  @UseGuard(HmacGuard)
  @Post('/hmac')
  hmac(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }

  @OasSummary('JWT issued by this service')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Authenticated principal'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid credentials'),
  )
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('Strategy not configured'),
  )
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Get('/jwt')
  jwt(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }

  @OasSummary('OAuth 2.0 access token from an external authorization server')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Authenticated principal'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid credentials'),
  )
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('Strategy not configured'),
  )
  @OasSecurity({oauth2: []})
  @UseGuard(OAuth2Guard)
  @Get('/oauth2')
  oauth2(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }

  @OasSummary('SSO session from OIDC or SAML')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Authenticated principal'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.json('Missing or invalid credentials'),
  )
  @OasResponse(
    HttpStatusCode.NOT_IMPLEMENTED,
    OpenApiConstants.json('Strategy not configured'),
  )
  @UseGuard(SsoGuard)
  @Get('/sso')
  sso(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }

  private static whoami(request: ExpressRequest): ApiResponse<Principal> {
    return ApiResponse.ok('Authenticated', request.principal!);
  }
}
