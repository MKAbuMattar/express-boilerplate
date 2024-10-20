import {OpenAPIRegistry} from '@asteasolutions/zod-to-openapi';
import {Router} from 'express';
import {z} from 'zod';

// User API
import {getUser, getUsers} from '@/api/user/user.controller';
import {GetUserSchema, UserSchema} from '@/api/user/user.model';
// Docs
import {createApiResponse} from '@/docs/openapi-response-builders.doc';
// Utils
import {validateRequest} from '@/utils/http-handlers.util';

export const userRegistry = new OpenAPIRegistry();
export const userRouter: Router = Router();

userRegistry.register('User', UserSchema);

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

userRouter.get('/', getUsers);

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

userRouter.get('/:id', validateRequest(GetUserSchema), getUser);
