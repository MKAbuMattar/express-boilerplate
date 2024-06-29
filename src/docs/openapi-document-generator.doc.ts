import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';

// Controllers
import {healthCheckRegistry} from '@/api/health-check/health-check.router';
import {userRegistry} from '@/api/user/user.router';

export const generateOpenAPIDocument = () => {
  const registry = new OpenAPIRegistry([healthCheckRegistry, userRegistry]);
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      version: '0.0.0',
      title: 'API Documentation',
      description: 'API Documentation',
    },
    externalDocs: {
      description: 'View the raw OpenAPI Specification in JSON format',
      url: '/docs/swagger.json',
    },
    tags: [
      {
        name: 'Health Check',
        description: 'Health Check API',
      },
      {
        name: 'User',
        description: 'User API',
      },
    ],
  });
};
