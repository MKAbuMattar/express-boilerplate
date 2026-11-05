import {
  Controller,
  Get,
  HttpStatusCode,
  OkHttpResponse,
} from '@inversifyjs/http-core';
import {OasResponse, OasSummary} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {ApiConstants} from '../constant/api.constants.js';
import {OpenApiConstants} from '../constant/openapi.constants.js';
import {JwtKeys} from '../security/jwt/jwt-keys.js';

/** Standard discovery documents. */
@Controller(ApiConstants.WELL_KNOWN)
export class WellKnownController {
  constructor(@inject(JwtKeys) private readonly keys: JwtKeys) {}

  @OasSummary('Public keys that verify this service JWTs (ES256 only)')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('JSON Web Key Set'))
  @Get(ApiConstants.JWKS)
  async jwks(): Promise<OkHttpResponse> {
    // Verifiers cache this; five minutes lets a rotation reach them quickly.
    return new OkHttpResponse(await this.keys.jwks(), {
      'Cache-Control': 'public, max-age=300',
    });
  }
}
