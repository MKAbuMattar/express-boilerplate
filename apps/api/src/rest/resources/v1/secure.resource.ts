import {ApiConstants} from '@express-boilerplate/common/constant/api.constants.js';
import {OpenApiConstants} from '@express-boilerplate/common/constant/openapi.constants.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {HmacGuard} from '@express-boilerplate/common/security/hmac/hmac.guard.js';
import {JwtGuard} from '@express-boilerplate/common/security/jwt/jwt.guard.js';
import {MtlsGuard} from '@express-boilerplate/common/security/mtls/mtls.guard.js';
import {OAuth2Guard} from '@express-boilerplate/common/security/oauth2/oauth2.guard.js';
import type {Principal} from '@express-boilerplate/common/security/principal.js';
import {SsoGuard} from '@express-boilerplate/common/security/sso/sso.guard.js';
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
  OasTag,
} from '@inversifyjs/http-open-api';
import type {Request as ExpressRequest} from 'express';

/** One endpoint per auth strategy. Copy the guard you need onto your own routes. */
@Controller(ApiConstants.V1_SECURE)
export class SecureV1Resource {
  @OasTag('Auth examples')
  @OasSummary('No auth')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Public endpoint'))
  @Get('/public')
  public(): ApiResponse {
    return ApiResponse.ok('Public endpoint', null);
  }

  // @feature:auth-mtls
  @OasTag('Auth examples')
  @OasSummary('Mutual TLS client certificate')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.PRINCIPAL)
  @OasResponse(HttpStatusCode.UNAUTHORIZED, OpenApiConstants.BAD_CREDENTIALS)
  @OasResponse(HttpStatusCode.NOT_IMPLEMENTED, OpenApiConstants.NOT_CONFIGURED)
  @UseGuard(MtlsGuard)
  @Get('/mtls')
  mtls(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }
  // @end:auth-mtls

  // @feature:auth-hmac
  @OasTag('Auth examples')
  @OasSummary('HMAC-SHA256 signed request')
  @OasParameter(
    OpenApiConstants.header('X-Client-Id', 'Client id from HMAC_CLIENTS'),
  )
  @OasParameter(OpenApiConstants.header('X-Timestamp', 'Unix seconds'))
  @OasParameter(
    OpenApiConstants.header('X-Signature', 'hex HMAC-SHA256, see README'),
  )
  @OasRequestBody(OpenApiConstants.ANY_JSON_BODY)
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.PRINCIPAL)
  @OasResponse(HttpStatusCode.UNAUTHORIZED, OpenApiConstants.BAD_CREDENTIALS)
  @OasResponse(HttpStatusCode.NOT_IMPLEMENTED, OpenApiConstants.NOT_CONFIGURED)
  @OasSecurity({hmac: []})
  @UseGuard(HmacGuard)
  @Post('/hmac')
  hmac(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }
  // @end:auth-hmac

  @OasTag('Auth examples')
  @OasSummary('JWT issued by this service')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.PRINCIPAL)
  @OasResponse(HttpStatusCode.UNAUTHORIZED, OpenApiConstants.BAD_CREDENTIALS)
  @OasResponse(HttpStatusCode.NOT_IMPLEMENTED, OpenApiConstants.NOT_CONFIGURED)
  @OasSecurity({bearerAuth: []})
  @UseGuard(JwtGuard)
  @Get('/jwt')
  jwt(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }

  // @feature:auth-oauth2
  @OasTag('Auth examples')
  @OasSummary('OAuth 2.0 access token from an external authorization server')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.PRINCIPAL)
  @OasResponse(HttpStatusCode.UNAUTHORIZED, OpenApiConstants.BAD_CREDENTIALS)
  @OasResponse(HttpStatusCode.NOT_IMPLEMENTED, OpenApiConstants.NOT_CONFIGURED)
  @OasSecurity({oauth2: []})
  @UseGuard(OAuth2Guard)
  @Get('/oauth2')
  oauth2(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }
  // @end:auth-oauth2

  // @feature:sso
  @OasTag('Auth examples')
  @OasSummary('SSO session from OIDC or SAML')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.PRINCIPAL)
  @OasResponse(HttpStatusCode.UNAUTHORIZED, OpenApiConstants.BAD_CREDENTIALS)
  @OasResponse(HttpStatusCode.NOT_IMPLEMENTED, OpenApiConstants.NOT_CONFIGURED)
  @UseGuard(SsoGuard)
  @Get('/sso')
  sso(@Request() request: ExpressRequest): ApiResponse<Principal> {
    return SecureV1Resource.whoami(request);
  }
  // @end:sso

  private static whoami(request: ExpressRequest): ApiResponse<Principal> {
    return ApiResponse.ok('Authenticated', request.principal!);
  }
}
