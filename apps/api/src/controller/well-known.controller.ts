import {ApiConstants} from '@express-boilerplate/common/constant/api.constants.js';
import {OpenApiConstants} from '@express-boilerplate/common/constant/openapi.constants.js';
import {JwtKeys} from '@express-boilerplate/common/security/jwt/jwt-keys.js';
import {
  Controller,
  Get,
  HttpStatusCode,
  OkHttpResponse,
} from '@inversifyjs/http-core';
import {OasResponse, OasSummary, OasTag} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';

/** Standard discovery documents. */
@Controller(ApiConstants.WELL_KNOWN)
export class WellKnownController {
  constructor(@inject(JwtKeys) private readonly keys: JwtKeys) {}

  @OasTag('Discovery')
  @OasSummary('Public keys that verify this service JWTs (ES256 only)')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.raw(
      'JSON Web Key Set',
      'application/json',
      OpenApiConstants.ref('JwkSet'),
    ),
  )
  @Get(ApiConstants.JWKS)
  async jwks(): Promise<OkHttpResponse> {
    // Verifiers cache this; five minutes lets a rotation reach them quickly.
    return new OkHttpResponse(await this.keys.jwks(), {
      'Cache-Control': 'public, max-age=300',
    });
  }
}
