# @express-boilerplate/api

The HTTP API: the process you run. It holds the controllers, REST resources, request DTOs, middleware and transports, and the composition root that wires the other packages together.

Depends on `@express-boilerplate/service` and `@express-boilerplate/common`. Controllers and resources call services; they never touch the database. A Biome rule fails the build if code here imports from `@express-boilerplate/persistence`, except entity types for converters and `application.ts`, which registers the persistence beans.

## What it serves

Everything runs on one TLS listener, port 443. There is no plaintext port.

| Path | What |
|---|---|
| `/api/v1/users`, `/api/v2/users` | Users CRUD. v2 adds paging, PATCH, ETags and `QUERY /api/v2/users/search` |
| `/api/v1/health`, `/actuator/health`, `/livez`, `/readyz`, `/healthz` | Health for load balancers and Kubernetes probes |
| `/metrics` | Prometheus metrics, ops networks only |
| `/auth/*` | OIDC and SAML login, `/auth/me`, logout, token revoke |
| `/.well-known/jwks.json` | Public keys for ES256 tokens |
| `/api/v1/secure/*` | One demo route per auth guard: mTLS, HMAC, JWT, OAuth2, SSO |
| `/api/v1/events` | Server-sent events |
| `/ws` | WebSocket (`wss://`) |
| TLS with ALPN `ndjson/1` | Newline-delimited JSON over TCP, when `TCP_ENABLED=true` |
| `/docs` | Swagger UI, development only |

## Layout

```
src/
├── main.ts                  HTTPS server, transports, graceful shutdown
├── application.ts           middleware chain, routes, bean registration
├── config/openapi.config.ts OpenAPI document
├── config/web/              ApiVersioning, HttpSemantics, RateLimiter, RequestGuards
├── config/transport/        WebSocketGateway, TcpServer
├── controller/              Authentication, Actuator, Probe, WellKnown
├── converter/               UserConverter: entity to v1/v2 DTO, ETag
├── exceptions/              GlobalExceptionFilter: errors to RFC 9457 problem details
└── rest/                    dto/v1, dto/v2, preconditions, resources/v1, resources/v2
scripts/                     generate-certs, generate-jwt-key, issue-jwt
test/                        unit, integration, e2e, security, monkey, chaos, containers
```

## Scripts

Run from the repo root (`pnpm dev`) or here with `pnpm --filter @express-boilerplate/api <script>`.

| Script | What |
|---|---|
| `dev` | Restarts on changes here or in a rebuilt package |
| `build`, `start` | Compile to `dist/`, run it |
| `certs` | Local CA, server cert and mTLS client certs in `certs/` |
| `jwt`, `jwt:keygen` | Dev token; ES256 key pair |
| `test`, `test:<type>` | Vitest projects: unit, integration, e2e, security, monkey, chaos, containers |

The tests live here because they exercise the assembled app. They start a real TLS server, so HTTPS, WSS and TCP are all tested on the production code path.

## Adding an endpoint

1. Add a resource class in `src/rest/resources/v<n>/` with `@Controller`, `@Get` and the OpenAPI decorators (`@OasTag`, `@OasSummary`, `@OasResponse`).
2. Inject a service contract from `@express-boilerplate/service` with `@inject(SomeService)`.
3. List the class in `Application.controllers`.
4. Guard it with `@UseGuard(...)` and `Scopes.require(...)` unless it is public. The route audit test fails on an unguarded route that is not on its public list.
