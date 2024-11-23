import type {IHealthCheckResponse} from '@/api/health-check/health-check.model';
import {ServiceResponse} from '@/models/service-response.model';
import {Controller, Get, Route, SuccessResponse, Tags} from '@tsoa/runtime';
import {StatusCodes} from 'http-status-codes';

@Route('health-check')
@Tags('Health Check')
export class HealthCheckController extends Controller {
  @Get()
  @SuccessResponse(StatusCodes.OK, 'Service is healthy')
  public async getHealthCheck(): Promise<IHealthCheckResponse> {
    return ServiceResponse.success('Service is healthy', null);
  }
}
