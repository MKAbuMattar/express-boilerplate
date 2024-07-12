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

export const authRegistry = new OpenAPIRegistry();

// "cookie": "connect.sid=s%3A4zarxhp8nzT4e6G5nIjYKWBzrnHKgqUq.%2FJg6ummKPaGpBxhiLYvy%2FP2g7ChngL8ki8M5lZqTICU; Path=/; Expires=Sat, 13 Jul 2024 15:49:30 GMT; HttpOnly"

export const authRouter: Router = (() => {
  const router = express.Router();

  const apiKeyAuth = authRegistry.registerComponent(
    'securitySchemes',
    'ApiKeyAuth',
    {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    },
  );

  authRegistry.registerPath({
    method: 'get',
    path: '/api/auth',
    tags: ['Auth'],
    summary: 'Auth API',
    security: [{[apiKeyAuth.name]: ['read:auth', 'write:auth']}],
    responses: createApiResponse(z.null(), 'Success'),
  });

  router.get('/', (_req: Request, res: Response) => {
    logger.info('$GET /api/auth - Auth API');

    const cookie = _req.cookies['connect.sid'];

    const serviceResponse = new ServiceResponse(
      ResponseStatus.Success,
      StatusCodes.OK,
      'Auth API',
      cookie,
    );
    handleServiceResponse(serviceResponse, res);
  });

  return router;
})();
