import {ApiConstants} from '@express-boilerplate/common/constant/api.constants.js';
import {OpenApiConstants} from '@express-boilerplate/common/constant/openapi.constants.js';
import {ScopeConstants} from '@express-boilerplate/common/constant/scope.constants.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {Scopes} from '@express-boilerplate/common/security/authorization/scopes.js';
import {JwtGuard} from '@express-boilerplate/common/security/jwt/jwt.guard.js';
import {
  NetworkService,
  type PingResult,
} from '@express-boilerplate/service/service/network.service.js';
import {
  Body,
  Controller,
  HttpStatusCode,
  Post,
  UseGuard,
} from '@inversifyjs/http-core';
import {
  OasRequestBody,
  OasResponse,
  OasSecurity,
  OasSummary,
  OasTag,
} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {PingRequestDto} from '../../dto/v1/ping-request.dto.js';

/** Network checks. JWT only: pinging reveals which internal hosts are up. */
@Controller(ApiConstants.V1_NETWORK)
export class NetworkV1Resource {
  constructor(
    @inject(NetworkService) private readonly networkService: NetworkService,
  ) {}

  @OasTag('Network')

  @OasSummary('ICMP ping a host (JWT)')
  @OasSecurity({bearerAuth: []})
  @OasRequestBody({
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['host'],
          properties: {host: {type: 'string', example: '127.0.0.1'}},
        },
      },
    },
  })
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json('Ping result', OpenApiConstants.ref('PingResult')),
  )
  @OasResponse(
    HttpStatusCode.BAD_REQUEST,
    OpenApiConstants.problem('Invalid host'),
  )
  @OasResponse(
    HttpStatusCode.UNAUTHORIZED,
    OpenApiConstants.problem('Missing or invalid JWT'),
  )
  @UseGuard(JwtGuard, Scopes.require(ScopeConstants.OPS_NETWORK))
  @Post('/ping')
  async ping(@Body() body: unknown): Promise<ApiResponse<PingResult>> {
    const {host} = PingRequestDto.from(body);
    return ApiResponse.ok(
      'Ping finished',
      await this.networkService.ping(host),
    );
  }
}
