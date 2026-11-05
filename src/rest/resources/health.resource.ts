import {
  Controller,
  Get,
  ServiceUnavailableHttpResponse,
} from '@inversifyjs/http-core';
import {OasSummary} from '@inversifyjs/http-open-api';
import {inject} from 'inversify';
import {DataSource} from 'typeorm';
import {ApiConstants} from '../../constant/api.constants.js';
import {CacheService} from '../../service/cache.service.js';
import {ApiResponse} from '../dto/api-response.dto.js';

@Controller(ApiConstants.API_HEALTH)
export class HealthResource {
  constructor(
    @inject(DataSource) private readonly dataSource: DataSource,
    @inject(CacheService) private readonly cache: CacheService,
  ) {}

  @OasSummary('Liveness and database readiness')
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
