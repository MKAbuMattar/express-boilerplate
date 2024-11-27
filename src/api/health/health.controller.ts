import type {IHealthResponse} from '@/api/health/health.model';
import {ServiceResponse} from '@/models/service-response.model';
import {Controller, Get, Route, SuccessResponse, Tags} from '@tsoa/runtime';
import {StatusCodes} from 'http-status-codes';

@Route('health')
@Tags('Health')
export class HealthController extends Controller {
  /**
   * Retrieves the health status of the service. <br/>
   * Supply no parameters and receive the health status of the service.
   */
  @Get()
  @SuccessResponse(StatusCodes.OK, 'Service is healthy')
  public async getHealth(): Promise<IHealthResponse> {
    this.setStatus(200);
    return ServiceResponse.success('Service is healthy', null);
  }
}
