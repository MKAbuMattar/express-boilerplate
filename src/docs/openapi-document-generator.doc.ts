import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';

// Controllers
import {HealthCheckRegistry} from '@/api/health-check/health-check.router';
import {UserRegistry} from '@/api/user/user.router';

export const generateOpenAPIDocument = () => {
  const openAPIRegistryConfig: OpenAPIRegistry[] = [
    HealthCheckRegistry,
    UserRegistry,
  ];

  const registry = new OpenAPIRegistry(openAPIRegistryConfig);
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
