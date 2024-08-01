import {OpenAPIRegistry} from '@asteasolutions/zod-to-openapi';
import express, {Request, Response, Router} from 'express';
import {z} from 'zod';

import {GetUserSchema, UserSchema} from '@/api/user/user.model';
import {userService} from '@/api/user/user.service';
// Docs
import {createApiResponse} from '@/docs/openapi-response-builders.doc';
// Models
import {
  handleServiceResponse,
  validateRequest,
} from '@/utils/http-handlers.util';

export const userRegistry = new OpenAPIRegistry();

userRegistry.register('User', UserSchema);

export const userRouter: Router = (() => {
  const router = express.Router();

  const apiKeyAuth = userRegistry.registerComponent(
    'securitySchemes',
    'ApiKeyAuth',
    {
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key',
    },
  );

  userRegistry.registerPath({
    method: 'get',
    path: '/api/users',
    tags: ['User'],
    security: [
      {
        [apiKeyAuth.name]: ['read:auth', 'write:auth'],
      },
    ],
    responses: createApiResponse(z.array(UserSchema), 'Success'),
  });

  router.get('/', async (_req: Request, res: Response) => {
    const serviceResponse = await userService.findAll();
    handleServiceResponse(serviceResponse, res);
  });

  userRegistry.registerPath({
    method: 'get',
    path: '/api/users/{id}',
    tags: ['User'],
    security: [
      {
        [apiKeyAuth.name]: ['read:auth', 'write:auth'],
      },
    ],
    request: {params: GetUserSchema.shape.params},
    responses: createApiResponse(UserSchema, 'Success'),
  });

  router.get(
    '/:id',
    validateRequest(GetUserSchema),
    async (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      const serviceResponse = await userService.findById(id);
      handleServiceResponse(serviceResponse, res);
    },
  );

  return router;
})();
