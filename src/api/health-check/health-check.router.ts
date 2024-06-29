import {OpenAPIRegistry} from '@asteasolutions/zod-to-openapi';
import express, {Request, Response, Router} from 'express';
import {StatusCodes} from 'http-status-codes';
import {z} from 'zod';

// Docs
import {createApiResponse} from '@/docs/openapi-response-builders.doc';
// Models
import {ResponseStatus, ServiceResponse} from '@/models/service-response.model';
import {logger} from '@/server';
// Utils
import {handleServiceResponse} from '@/utils/http-handlers.util';

export const healthCheckRegistry = new OpenAPIRegistry();

export const healthCheckRouter: Router = (() => {
  const router = express.Router();

  healthCheckRegistry.registerPath({
    method: 'get',
    path: '/health-check',
    tags: ['Health Check'],
    responses: createApiResponse(z.null(), 'Success'),
  });

  router.get('/', (_req: Request, res: Response) => {
    logger.info('$GET /health-check - Service is healthy');
    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      StatusCodes.OK,
      'Service is healthy',
      null,
    );
    handleServiceResponse(serviceResponse, res);
  });

  return router;
})();
