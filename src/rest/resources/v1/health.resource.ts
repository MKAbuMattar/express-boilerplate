import {
  Controller,
  Get,
  HttpStatusCode,
  ServiceUnavailableHttpResponse,
} from '@inversifyjs/http-core';
import {OasResponse, OasSummary} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {DataSource} from 'typeorm';
import {ApiConstants} from '../../../constant/api.constants.js';
import {OpenApiConstants} from '../../../constant/openapi.constants.js';
import {CacheService} from '../../../service/cache.service.js';
import {ApiResponse} from '../../dto/api-response.dto.js';

@Controller(ApiConstants.V1_HEALTH)
export class HealthV1Resource {
  constructor(
    @inject(DataSource) private readonly dataSource: DataSource,
    @inject(CacheService) private readonly cache: CacheService,
  ) {}

  @OasSummary('Liveness and database readiness')
  @OasResponse(HttpStatusCode.OK, OpenApiConstants.json('Service is healthy'))
  @OasResponse(
    HttpStatusCode.SERVICE_UNAVAILABLE,
    OpenApiConstants.json('Database not connected'),
  )
  @Get()
  getHealth(): ApiResponse<{database: string; cache: string}> {
    if (!this.dataSource.isInitialized) {
      throw new ServiceUnavailableHttpResponse(
        ApiResponse.fail('Database not connected'),
      );
    }
    return ApiResponse.ok('Service is healthy', {
      database: this.dataSource.options.type,
      cache: this.cache.type,
    });
  }
}
