import {OpenAPIRegistry} from '@asteasolutions/zod-to-openapi';
import express, {type Request, type Response, type Router} from 'express';
import {StatusCodes} from 'http-status-codes';
import {z} from 'zod';

// Docs
import {createApiResponse} from '@/docs/openapi-response-builders.doc';
// libs
import {logger} from '@/libs/logger.lib';
// Models
import {ResponseStatus, ServiceResponse} from '@/models/service-response.model';
// Utils
import {handleServiceResponse} from '@/utils/http-handlers.util';

export const healthCheckRegistry = new OpenAPIRegistry();
export const healthCheckRouter: Router = express.Router();

healthCheckRegistry.registerPath({
  method: 'get',
  path: '/health-check',
  tags: ['Health Check'],
  summary: 'Health Check API',
  responses: createApiResponse(z.null(), 'Success'),
});

healthCheckRouter.get('/', (_req: Request, res: Response) => {
  logger.info('$GET /health-check - Service is healthy');
  const serviceResponse = new ServiceResponse(
    ResponseStatus.Success,
    StatusCodes.OK,
    'Service is healthy',
    null,
  );
  handleServiceResponse(serviceResponse, res);
});
