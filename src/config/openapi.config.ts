import {readFileSync} from 'node:fs';
import type {OpenApi3Dot1Object} from '@inversifyjs/open-api-types/v3Dot1';
import {OpenApiConstants} from '../constant/openapi.constants.js';
import type {AppConfig} from './app.config.js';

/**
 * The OpenAPI 3.1 document behind Swagger UI (/docs, development only):
 * overview, tags in reading order, reusable schemas and every way to
 * authenticate. Operations add their own summaries, tags and responses with
 * the Oas* decorators.
 */
export class OpenApiConfig {
  static readonly TAGS = [
    {
      name: 'Health',
      description: 'API health (v1). Probes use the Actuator paths.',
    },
    {name: 'Users v1', description: 'Users, version 1: plain list, no phone.'},
    {
      name: 'Users v2',
      description:
        'Users, version 2: paging, search, phone, and every HTTP method with its RFC 9110 meaning. Writes take If-Match; reads return an ETag. Also `QUERY /api/v2/users/search` with a JSON body `{search, page, size}`: a safe, idempotent search (OpenAPI 3.1 cannot list the QUERY method, so it is described here).',
    },
    {
      name: 'Authentication',
      description:
        'Browser single sign-on (OIDC, SAML 2.0), the session it creates, and token revocation.',
    },
    {
      name: 'Auth examples',
      description:
        'One route per authentication method. Copy the guard you need onto your own routes.',
    },
    {name: 'Experiments', description: 'A/B testing with sticky variants.'},
    {
      name: 'Events',
      description:
        'Server-Sent Events: live user.created / user.updated / user.deleted.',
    },
    {
      name: 'Queues',
      description:
        'Background jobs and their dead-letter queues. Scope ops:queues, ops networks only.',
    },
    {
      name: 'Network',
      description: 'ICMP reachability. Scope ops:network, ops networks only.',
    },
    {
      name: 'Actuator',
      description:
        'Spring Boot Actuator-style health groups (and the /healthz, /livez, /readyz aliases), info and Prometheus metrics.',
    },
    {
      name: 'Discovery',
      description: 'Well-known documents, such as the JWT signing keys.',
    },
  ];

  static document(config: AppConfig): OpenApi3Dot1Object {
    return {
      openapi: '3.1.1',
      info: {
        title: 'Express Boilerplate API',
        version: OpenApiConfig.version(),
        summary: 'Layered Express 5 and TypeScript API',
        description: OpenApiConfig.DESCRIPTION,
        contact: {
          name: 'MKAbuMattar',
          url: 'https://github.com/MKAbuMattar/express-boilerplate',
        },
        license: {name: 'MIT', identifier: 'MIT'},
      },
      servers: [{url: config.env.PUBLIC_URL, description: 'This server'}],
      tags: OpenApiConfig.TAGS,
      components: {
        schemas: OpenApiConstants.SCHEMAS,
        securitySchemes: OpenApiConfig.securitySchemes(config),
      },
    } as OpenApi3Dot1Object;
  }

  /**
   * QUERY routes are registered for every method (@All) and answer 405 to
   * all but QUERY. OpenAPI 3.1 has no QUERY, so remove the misleading
   * operations; the tag description documents them instead.
   */
  static dropQueryRoutes(document: OpenApi3Dot1Object): void {
    delete (document.paths as Record<string, unknown> | undefined)?.[
      '/api/v2/users/search'
    ];
  }

  private static securitySchemes(config: AppConfig) {
    const {OIDC_ISSUER} = config.env;
    return {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'A JWT from this service (`pnpm jwt`). Needs scopes such as users:write for writes.',
      },
      oauth2: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'An access token from your OAuth 2.0 authorization server (Keycloak, Auth0, Entra ID, Okta), checked against its JWKS.',
      },
      hmac: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Signature',
        description:
          'Hex HMAC-SHA256 of "<X-Timestamp>\\n<METHOD>\\n<path?query>\\n<raw body>", with X-Client-Id and X-Timestamp headers. Each signature works once.',
      },
      mutualTLS: {
        type: 'mutualTLS',
        description: 'A client certificate signed by the service CA.',
      },
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description: 'The SSO session cookie set by an OIDC or SAML login.',
      },
      ...(OIDC_ISSUER && {
        openIdConnect: {
          type: 'openIdConnect',
          openIdConnectUrl: `${OIDC_ISSUER.replace(/\/+$/, '')}/.well-known/openid-configuration`,
        },
      }),
    };
  }

  private static version(): string {
    try {
      return (
        JSON.parse(readFileSync('package.json', 'utf8')).version ?? '0.0.0'
      );
    } catch {
      return '0.0.0';
    }
  }

  private static readonly DESCRIPTION = `
A layered Express 5 API (Spring Boot style) with several databases, caches, queues and authentication methods.

**Versions.** Every route lives under \`/api/v1\` or \`/api/v2\`. Plain \`/api/...\` is an alias of v1. Each response carries an \`API-Version\` header.

**Authentication.** mTLS, HMAC, JWT, OAuth 2.0 bearer tokens, and OIDC or SAML single sign-on. Writes also need a scope (\`users:write\`, \`ops:queues\`, \`ops:network\`): a valid token without it gets 403.

**Errors.** Every 4xx and 5xx is RFC 9457 problem details (\`application/problem+json\`, schema \`Problem\`) with a \`requestId\` you can quote in a bug report.

**Limits.** Rate limited per IP (\`RateLimit-*\` headers, 429 with \`Retry-After\`), JSON bodies only, 1 MB, 32 levels deep. Send an \`Idempotency-Key\` on POST or PATCH to retry safely.
`.trim();
}
