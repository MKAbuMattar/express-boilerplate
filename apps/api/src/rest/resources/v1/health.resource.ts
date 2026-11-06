import {ApiConstants} from '@express-boilerplate/common/constant/api.constants.js';
import {OpenApiConstants} from '@express-boilerplate/common/constant/openapi.constants.js';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {CacheService} from '@express-boilerplate/common/service/cache.service.js';
import {HealthService} from '@express-boilerplate/service/service/health.service.js';
import {
  Controller,
  Get,
  HttpStatusCode,
  ServiceUnavailableHttpResponse,
} from '@inversifyjs/http-core';
import {OasResponse, OasSummary, OasTag} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';

@Controller(ApiConstants.V1_HEALTH)
export class HealthV1Resource {
  constructor(
    @inject(HealthService) private readonly health: HealthService,
    @inject(CacheService) private readonly cache: CacheService,
  ) {}

  @OasTag('Health')
  @OasSummary('Liveness and database readiness')
  @OasResponse(
    HttpStatusCode.OK,
    OpenApiConstants.json(
      'Service is healthy',
      OpenApiConstants.ref('HealthV1'),
    ),
  )
  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,
    OpenApiConstants.problem('Database not connected'),
  )
  @Get()
  getHealth(): ApiResponse<{database: string; cache: string}> {
    if (!this.health.databaseUp) {
      throw new ServiceUnavailableHttpResponse(
        ApiResponse.fail('Database not connected'),
      );
    }
    return ApiResponse.ok('Service is healthy', {
      database: this.health.databaseType,
      cache: this.cache.type,
    });
  }
}
