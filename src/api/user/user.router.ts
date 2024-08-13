import {OpenAPIRegistry} from '@asteasolutions/zod-to-openapi';
import express, {type Request, type Response, type Router} from 'express';
import {z} from 'zod';

// User Controller
import {getUser, getUsers} from '@/api/user/user.controller';
import {GetUserSchema, UserSchema} from '@/api/user/user.model';
// Docs
import {createApiResponse} from '@/docs/openapi-response-builders.doc';
// Models
import {validateRequest} from '@/utils/http-handlers.util';

export const UserRegistry = new OpenAPIRegistry();
export const UserRouter: Router = express.Router();

UserRegistry.register('User', UserSchema);

const apiKeyAuth = UserRegistry.registerComponent(
  'securitySchemes',
  'ApiKeyAuth',
  {
    type: 'apiKey',
    in: 'header',
    name: 'X-API-Key',
  },
);

UserRegistry.registerPath({
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

UserRouter.get('/', getUsers);

UserRegistry.registerPath({
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

UserRouter.get('/:id', validateRequest(GetUserSchema), getUser);
