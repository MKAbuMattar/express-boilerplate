# Express Boilerplate

A boilerplate for building scalable applications with Express.js, TypeScript, and Pino Logger

<div class="badges" align="center">

[![GitHub](https://img.shields.io/badge/github-%23181717.svg?style=for-the-badge&logo=github&logoColor=white)](https://github.com/MKAbuMattar/express-boilerplate)
[![GitHub Releases](https://img.shields.io/github/v/release/MKAbuMattar/express-boilerplate?include_prereleases&sort=date&style=for-the-badge)](https://github.com/MKAbuMattar/express-boilerplate/releases)
[![GitHub Stars](https://img.shields.io/github/stars/MKAbuMattar/express-boilerplate.svg?style=for-the-badge)](https://github.com/MKAbuMattar/express-boilerplate/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/MKAbuMattar/express-boilerplate.svg?style=for-the-badge)](https://github.com/MKAbuMattar/express-boilerplate/forks)
[![GitHub Issues](https://img.shields.io/github/issues/MKAbuMattar/express-boilerplate.svg?style=for-the-badge)](https://github.com/MKAbuMattar/express-boilerplate/issues)
[![GitHub License](https://img.shields.io/github/license/MKAbuMattar/express-boilerplate.svg?style=for-the-badge)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2026-brightgreen.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/language-TypeScript-blue.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![CI Pipeline](https://img.shields.io/github/actions/workflow/status/MKAbuMattar/express-boilerplate/ci-pipeline.yml?branch=main&style=for-the-badge&label=CI%20Pipeline)](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/ci-pipeline.yml)
[![CI CodeQL Analysis](https://img.shields.io/github/actions/workflow/status/MKAbuMattar/express-boilerplate/codeql-analysis.yml?branch=main&style=for-the-badge&label=CodeQL%20Analysis)](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/codeql-analysis.yml)
[![CI Docker Cleanup](https://img.shields.io/github/actions/workflow/status/MKAbuMattar/express-boilerplate/docker-image-cleanup.yml?branch=main&style=for-the-badge&label=CI%20Docker%20Cleanup)](https://github.com/MKAbuMattar/express-boilerplate/actions/workflows/docker-image-cleanup.yml)

</div>

## Quick start

Needs Node 26+, pnpm 12, and openssl.

```sh
pnpm install
pnpm certs          # local CA, server cert (localhost) and client cert in ./certs
pnpm dev            # https://localhost/docs
```

`pnpm dev` loads `.env.development` (NODE_ENV and an in-memory database), then your `.env` if it exists. Copy `.env.example` to `.env` to turn on JWT, HMAC, OAuth2, OIDC or SAML. `pnpm jwt` prints a token for Swagger's Authorize button.

Trust `certs/ca.crt` in your OS to remove the browser warning. Swagger UI at `/docs` runs only when `NODE_ENV=development`.

| Script | What it does |
|---|---|
| `pnpm dev` | Watch mode with tsx |
| `pnpm build` | Compile with TypeScript 7 to `dist/` |
| `pnpm start` | Run `dist/main.js` |
| `pnpm test` | Every test type (see Testing) |
| `pnpm test:<type>` | One type: `unit`, `integration`, `containers`, `e2e`, `security`, `monkey`, `chaos` |
| `pnpm migration:show` / `:run` / `:revert` / `:create` | Database migrations |
| `pnpm test:cov` | Coverage for unit and integration |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm certs [dir] [--force]` | Generate local TLS and mTLS certs |
| `pnpm jwt [subject] [ttl] [scopes]` | Print a dev JWT (all scopes by default) |
| `pnpm jwt:keygen` | New ES256 key pair for `JWT_ALGORITHM=ES256` |

## Project structure

Layered like a Spring Boot application. Every unit is a class.

```
src/
├── main.ts                  Main: HTTPS server, socket limits, transports, graceful shutdown
├── application.ts           Application: container, middleware, routes, lifecycle
├── config/                  AppConfig (env), AppConfiguration (@Bean), BeanFactory, stereotypes,
│   │                        DatabaseConfig, TlsConfig, ApiVersioning, HttpSemantics,
│   │                        RateLimiter, ServerHardening, cli.data-source (migrations CLI)
│   ├── cache/               CacheStore, MemoryCacheStore, RedisCacheStore
│   └── queue/               QueueBroker, MemoryQueueBroker, BullMqQueueBroker
├── constant/                ApiConstants, SecurityConstants, CacheConstants, QueueConstants, ...
├── controller/              AuthenticationController (OIDC and SAML login flows)
├── converter/               UserConverter (entity to v1/v2 DTO, ETag)
├── enumeration/             AuthStrategy, DatabaseType, CacheType, ExperimentVariant
├── exceptions/              AuthException, GlobalExceptionFilter, ProblemDetails (RFC 9457)
├── migration/               Versioned schema changes, one class each
├── model/                   UserEntity, AppEvent, DeadLetter
├── repository/              UserRepository
├── rest/
│   ├── dto/                 ApiResponse, CreateUserDto; v1/ and v2/ request and response shapes
│   ├── preconditions.ts     If-Match / If-None-Match
│   └── resources/v1, v2     REST resources per API version
├── security/                principal.ts, hmac/ jwt/ mtls/ oauth2/ sso/
├── service/                 Contracts: UserService, CacheService, ExperimentService, NetworkService;
│   │                        EventBus, JobRegistry
│   └── impl/                Implementations
├── transport/               WebSocketGateway, TcpServer, UdpServer
└── util/                    AppLogger, @Cacheable / @CacheEvict
```

### Beans and dependency injection

`BeanFactory` wraps an Inversify 8 container. Beans are singletons by default.

- `@Component()`, `@Service()` and `@Repository()` mark classes the container builds itself.
- A `@Configuration()` class holds `@Bean(Token)` methods for everything else: third-party objects, and an abstract service bound to its implementation.

```ts
@Configuration()
export class AppConfiguration {
  @Bean(UserService)
  userService(beans: BeanFactory): UserService {
    return beans.getBean(UserServiceImpl);
  }
}
```

`@Bean` takes the token explicitly because esbuild (used by tsx and Vitest) emits no return type metadata. Constructor parameters use `@inject(Token)` for the same reason.

## Authentication

Put a guard on a route or a whole controller with `@UseGuard(...)`. Each guard sets `request.principal`. `/api/secure/*` has one demo route per guard. A strategy with no configuration returns **501**; bad credentials return **401**.

| Strategy | Guard | Configure | Client sends |
|---|---|---|---|
| Public | none | nothing | nothing |
| mTLS | `MtlsGuard` | `TLS_CA_FILE` | a client certificate signed by that CA |
| HMAC | `HmacGuard` | `HMAC_CLIENTS=id:secret,...` | `X-Client-Id`, `X-Timestamp`, `X-Signature` |
| JWT | `JwtGuard` | `JWT_SECRET` (32+ chars) | `Authorization: Bearer <token from TokenProvider>` |
| OAuth 2.0 | `OAuth2Guard` | `OAUTH2_ISSUER`, `OAUTH2_AUDIENCE`, `OAUTH2_JWKS_URI` | a Bearer access token from Keycloak, Auth0, Entra ID, Okta |
| OIDC (SSO) | `SsoGuard` | `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | browser login at `/auth/oidc/login` |
| SAML 2.0 (SSO) | `SsoGuard` | `SAML_ENTRY_POINT`, `SAML_ISSUER`, `SAML_IDP_CERT` | browser login at `/auth/saml/login` |

**HMAC signature:** hex `HMAC-SHA256(secret, "<unix-seconds>\n<METHOD>\n<path?query>\n<raw body>")`. The timestamp must be within 5 minutes, and each signature is accepted once.

**SSO:** OIDC uses the authorization code flow with PKCE. SAML uses SP-initiated login with an HTTP-POST ACS at `/auth/saml/acs` and metadata at `/auth/saml/metadata`. Both end in the same signed, httpOnly session cookie (8 hours). Use `GET /auth/me` to read it and `POST /auth/logout` to end it.

**mTLS behind a load balancer:** `MtlsGuard` reads the direct TLS socket. If TLS terminates at a proxy, read the client certificate header your proxy forwards.

### Authorization (scopes)

Authentication says who the caller is; scopes say what they may do. Put `Scopes.require(...)` after an auth guard:

```ts
@UseGuard(JwtGuard, Scopes.require(ScopeConstants.USERS_WRITE))
```

A caller missing a scope gets `403` with `WWW-Authenticate: Bearer error="insufficient_scope"`. Scopes come from the token claims IdPs use: `scope` (OAuth 2.0), `scp` (Entra ID), `roles`, `permissions` (Auth0). HMAC and mTLS clients get scopes from `HMAC_CLIENT_SCOPES` and `MTLS_CLIENT_SCOPES`.

| Scope | Routes |
|---|---|
| `users:write` | every user write, v1 and v2 |
| `ops:queues` | `/api/v1/queues/*` (also limited to `OPS_ALLOWED_CIDRS`) |
| `ops:network` | `/api/v1/network/ping` (also limited to `OPS_ALLOWED_CIDRS`) |

`pnpm test:security` includes a route audit: every route must refuse an anonymous caller unless it is on the public list in `test/security/route-audit.security.test.ts`, so a route that forgets its guard fails CI.

### Tokens

- Every JWT has `sub`, `jti`, `iat`, `exp`; all four are required, plus issuer, audience and the configured algorithm (no `alg: none`, no algorithm confusion), with 30 s clock tolerance.
- Revocation: `POST /auth/token/revoke` revokes the bearer token; `POST /auth/logout` revokes the SSO session server-side, so a copied cookie stops working at once. The deny-list lives in the cache until the token would have expired; if the cache is down it fails open (tokens are short-lived).
- Keys: `JWT_ALGORITHM=HS256` uses `JWT_SECRET`. `ES256` signs with `JWT_PRIVATE_KEY_FILE` and publishes public keys at `/.well-known/jwks.json`, so other services verify without a secret. Rotate with `pnpm jwt:keygen`: point `JWT_PRIVATE_KEY_FILE` at the new key and list the old `.pub` in `JWT_PUBLIC_KEY_FILES` until its tokens expire.
- OIDC logins use PKCE, state and a nonce.

### Request protection

Every request passes, in order: request id (`X-Request-Id`, also in error bodies), host check (421 for unknown hosts), rate limit, CORS, cross-site guard (Fetch Metadata and Origin block CSRF on writes), JSON-only bodies and size and depth limits, `Cache-Control` (`no-store` with credentials), a handler deadline (503), the ops IP allowlist, an audit log line for every write, and `Idempotency-Key` on POST and PATCH (a retried create replays the first response).

## REST API

### Versions

Every route lives under a version: `/api/v1/...`, `/api/v2/...`. Unversioned `/api/...` keeps working as an alias of v1, and every API response carries an `API-Version` header. A new version gets its own folder in `rest/resources/` and its own DTOs; older versions keep their shape.

| | v1 | v2 |
|---|---|---|
| `GET /users` | array | page: `?page=&size=&search=` returns `{items, page, size, total, pages}` |
| user fields | id, name, email, age, dates | v1 plus `phone` |
| writes | POST, DELETE | POST, PUT, PATCH, DELETE, QUERY |

### Methods

v2 users follow RFC 9110 meanings:

| Method | Does | Safe | Idempotent | Success |
|---|---|---|---|---|
| GET / HEAD | read | yes | yes | 200, or 304 with `If-None-Match` |
| QUERY `/search` | search, criteria in the body | yes | yes | 200 |
| POST | create, server picks the id | no | no | 201 + `Location` |
| PUT | replace every field, or create at this id | no | yes | 200, or 201 + `Location` |
| PATCH | change some fields (`application/merge-patch+json`) | no | no | 200 |
| DELETE | remove | no | yes | 204 (404 if already gone) |
| OPTIONS | list allowed methods | yes | yes | 204 + `Allow` |

Reads return an `ETag`. Send it back as `If-Match` on PUT, PATCH or DELETE to get `412` if someone changed the resource in between. `If-None-Match: *` on PUT means create only.

### Responses

Success uses the envelope `{success, message, data}`. Every 4xx and 5xx is [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem details (`application/problem+json`), and keeps `success`, `message` and `data` so older clients still parse it:

```json
{"type": "about:blank", "title": "Bad Request", "status": 400, "detail": "Validation failed",
 "instance": "/api/v2/users", "success": false, "message": "Validation failed", "data": {"age": "must be an integer from 0 to 150"}}
```

| Status | When | Extra header |
|---|---|---|
| 400 | validation failed (`data` lists fields), malformed JSON | |
| 401 | no or bad credentials | `WWW-Authenticate` |
| 404 | unknown resource or route | |
| 405 | known path, wrong method; TRACE always | `Allow` |
| 409 | email already used | |
| 412 | `If-Match` stale, or `If-None-Match: *` and it exists | |
| 415 | body is not JSON | `Accept-Post`, `Accept-Patch` |
| 429 | rate limit | `Retry-After`, `RateLimit-*` |
| 500 | bug (logged, never leaks a stack) | |
| 501 | auth strategy not configured | |
| 503 | database, cache (for HMAC) or IdP down | `Retry-After` |

## Database migrations

Schema changes are migration classes in `src/migration`, written with TypeORM's schema builder, so one migration runs on Postgres, MySQL, MariaDB, MSSQL and SQLite alike. They run at startup (`DB_MIGRATIONS_RUN=true`) and are recorded in `schema_migrations`. `synchronize` is off. MongoDB is schemaless and skips them.

```sh
pnpm migration:show                       # applied and pending
pnpm migration:create src/migration/AddX  # new file; then add it to DatabaseConfig.migrations
pnpm migration:run / pnpm migration:revert
pnpm migration:prod                       # in a built image: node dist/...
```

A test runs every migration and asks TypeORM for the remaining difference to the entities; it must be empty. Never edit a shipped migration; add a new one.

## Realtime and network

| Protocol | Where | Auth | Notes |
|---|---|---|---|
| WebSocket | `wss://host/ws` | JWT (`Authorization` or `?access_token=`), or SSO cookie from an allowed Origin | JSON `{type}`: ping, echo, whoami, broadcast; server events pushed as `event`; dead clients dropped by heartbeat |
| SSE | `GET /api/v1/events` | public, ids only | `new EventSource(...)`; heartbeat every 15 s |
| TCP | `TCP_PORT` (TLS) | mTLS cert, or `{"type":"auth","token":"<jwt>"}` first | newline-delimited JSON, 64 KB lines, 60 s idle |
| UDP | `UDP_PORT` | none | JSON ping/echo; never replies bigger than the request (no amplification) |
| ICMP | `POST /api/v1/network/ping` | JWT | strict host validation, `ping` run without a shell |

Events (`user.created`, `user.updated`, `user.deleted`) come from the in-process `EventBus`. With several instances, back it with Redis pub/sub.

## Queues and dead letters

`QUEUE_TYPE=bullmq` uses BullMQ on Redis/Valkey/ElastiCache; `memory` is for dev and tests. A job is tried `QUEUE_ATTEMPTS` times with exponential backoff; if every try fails it moves to `<queue>.dlq` with its error.

```http
POST /api/v1/queues/demo/jobs                      {"fail": true}   -> 202 {jobId}
GET  /api/v1/queues/demo/dead-letters                               -> the failed jobs
POST /api/v1/queues/demo/dead-letters/{id}/replay                   -> 202, back on the queue
```

`user.created` enqueues a `welcome-email` job. Add a queue: name it in `QueueConstants`, register its handler in `JobRegistry`.

## Databases

TypeORM 1.x. Set `DB_TYPE` and `DB_URL`.

| `DB_TYPE` | Driver | `DB_URL` example |
|---|---|---|
| `postgres` | `pg` | `postgres://app:app@localhost:5432/app` |
| `mysql` | `mysql2` | `mysql://app:app@localhost:3306/app` |
| `mariadb` | `mysql2` | `mysql://app:app@localhost:3307/app` |
| `mongodb` | `mongodb` | `mongodb://app:app@localhost:27017/app?authSource=admin` |
| `mssql` | `mssql` (install it) | `mssql://sa:Passw0rd!@localhost:1433/app` |
| `sqljs` | `sql.js` | empty for in-memory, or a file path |

`DB_SYNCHRONIZE=true` creates tables for development. Production should use TypeORM migrations instead.

## Cache

`CACHE_TYPE=memory` keeps the cache in the process, for dev and tests. `CACHE_TYPE=redis` works with Redis, Valkey, AWS ElastiCache and MemoryDB:

- `CACHE_URL=rediss://...` for TLS (ElastiCache in-transit encryption)
- `CACHE_CLUSTER=true` for cluster-mode endpoints

Services use Spring-style cache-aside decorators:

```ts
@Cacheable((id: string) => CacheConstants.user(id))
findById(id: string): Promise<UserEntity> { ... }

@CacheEvict(() => CacheConstants.USERS_ALL, (id: string) => CacheConstants.user(id))
delete(id: string): Promise<void> { ... }
```

`@Cacheable` returns the cached value, or runs the method and stores the result for `CACHE_TTL_SECONDS`. `@CacheEvict` runs the method, then deletes the listed keys. Values round-trip through JSON, so the converters accept dates as either `Date` or ISO strings. The HMAC guard also uses the cache to reject replayed signatures, so run Redis when you have more than one instance.

## A/B experiments

Configure experiments as `name:percentInA` pairs:

```sh
EXPERIMENTS=new-checkout:50,new-search:10
```

`GET /api/experiments/{name}` returns `{experiment, variant}` and an `X-Experiment-Variant` header. Signed-in (SSO) users are bucketed by their subject, so they keep their variant across devices. Visitors get a signed `ab_id` cookie. Bucketing hashes `experiment:subject` into 0..99, so it needs no storage, every instance agrees, and each experiment splits users independently. In code, inject `ExperimentService` and call `assign(name, subjectId)`.

## Testing

Vitest runs one project per test type. `pnpm test` runs them all.

| Type | Folder | What it proves |
|---|---|---|
| `unit` | `test/unit/` | One class at a time with fakes: guards, DTO validation, converter, cache, decorators, `BeanFactory`, config, A/B bucketing |
| `integration` | `test/integration/` | The whole app in-process through HTTP, on sql.js and the memory cache |
| `containers` | `test/containers/` | The same flows on real Postgres, MySQL, MariaDB, MongoDB, Redis and Valkey via Testcontainers. Skipped when Docker is not running. |
| `e2e` | `test/e2e/` | The real server process over HTTPS with a mock OIDC/OAuth2 provider: every endpoint and auth strategy, including the full OIDC login |
| `security` | `test/security/` | SQL and command injection payloads at every input; rate limits, prototype pollution, slowloris, oversized headers, security headers |
| `monkey` | `test/monkey/` | 1500 random methods, paths, headers and bodies (fast-check). No unexpected 5xx, always JSON, still healthy afterwards. |
| `chaos` | `test/chaos/` | Dependencies fail on purpose: database down (503, then recovers), cache down or hanging (requests still succeed), cache down for HMAC (503, fails closed), IdP down (503), JWKS down (401), a flaky repository, 300 concurrent requests |

What the chaos tests pin down:

- **Cache reads and writes fail open.** A cache error or a call slower than `CACHE_TIMEOUT_MS` (default 200) counts as a miss.
- **The HMAC replay check fails closed** with 503, so a cache outage never lets a replayed request through.
- **An unreachable database answers 503**, not 500, so load balancers and clients retry.

## Security

### Known CVEs

| Layer | Guard |
|---|---|
| npm dependencies | `pnpm audit --prod --audit-level=high` fails CI; also daily, because new CVEs hit unchanged code |
| Docker image | Trivy scans OS packages and `node_modules` (fails on fixable HIGH/CRITICAL), results in GitHub code scanning, CycloneDX SBOM as an artifact |
| Dockerfile, compose, Caddyfile | Trivy config scan |
| updates | Renovate opens CVE fixes at any time; other npm updates wait 3 days |
| supply chain | pnpm `minimumReleaseAge` refuses versions younger than 3 days (most hijacked releases are pulled within hours); install scripts are off unless listed in `allowBuilds` |
| code | CodeQL, dependency review on PRs, OpenSSF Scorecard (existing workflows) |

Dev-only advisories are patched with `overrides` in `pnpm-workspace.yaml`; each entry says why and when to drop it.

### Runtime

- Prototype pollution: `--disable-proto=delete` (removes `__proto__`), flat query strings, DTOs copy only known fields.
- Injection: bound SQL parameters everywhere, LIKE wildcards escaped; `ping` through `execFile` with a validated host. `pnpm test:security` throws SQL and shell payloads at every input.
- Abuse: rate limit per IP (stricter on `/auth`), shared through Redis; slowloris and header-flood limits at the socket (`HTTP_*_TIMEOUT_MS`, 16 KB headers, checked every second); 1 MB bodies.
- TLS: 1.2+ with ECDHE AEAD suites only.
- Headers: Helmet (HSTS, CSP, nosniff, frame options), no `X-Powered-By`, no stack traces in responses.
- Container: non-root, read-only filesystem, all capabilities dropped, no privilege escalation, npm and yarn removed from the image, OS packages upgraded at build.

## HTTP/3

Express runs on Node's HTTP/1.1 stack, and Node has no stable HTTP/3. So, as with CDNs and cloud load balancers, HTTP/3 ends at an edge proxy: compose puts [Caddy](https://caddyserver.com) on port 443 (TCP for HTTP/1.1 and HTTP/2, UDP for HTTP/3 over QUIC), advertising `Alt-Svc: h3`. Caddy talks HTTPS to the app, which is not published.

mTLS keeps working through the proxy: Caddy forwards the client certificate in `X-Client-Cert`, and `MtlsGuard` trusts that header only on a connection that presents the proxy's own certificate (`edge-proxy`), then verifies the forwarded certificate against the CA. The app trusts one proxy hop (`TRUST_PROXY=1`), so a client cannot fake its IP to dodge the rate limit.

Production: set `SITE_ADDRESS=api.example.com` and follow the comment in `deploy/caddy/Caddyfile` to switch to automatic Let's Encrypt certificates. On AWS, CloudFront or an ALB with HTTP/3 can play the same role.

## Docker

```sh
pnpm certs
docker compose up --build                                   # Caddy (HTTP/3) + app on https://localhost
docker compose --profile postgres --profile redis up --build
```

Profiles: `postgres`, `mysql`, `mariadb`, `mongodb`, `redis`, `valkey`. The image runs as the non-root `node` user on port 8443, reachable only through Caddy on 443. Certs are mounted read-only at `/app/certs`, and secrets come from the environment, never from build args. To pull the base image from AWS ECR Public:

```sh
docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:26-alpine .
```

### Full local stack

One command runs the app with a real identity provider, a gateway, a secrets store, observability and a mail catcher:

```sh
pnpm certs
APP_ENV_FILE=deploy/full-stack.env docker compose --profile full up --build
```

| Profile | Service | Open | What it shows |
|---|---|---|---|
| default | Caddy, app, Postgres, Redis | https://localhost | HTTP/3, the API, Swagger at `/docs` |
| `idp` | Keycloak 26 | https://keycloak.localhost:8543 (admin/admin) | realm `demo`: browser login as alice/alice through OIDC; `api-client` gets tokens with `users:write` by client credentials, checked by `OAuth2Guard` and scopes |
| `gateway` | APISIX 3 | http://localhost:9080 | the same API behind a gateway: request id, edge rate limit, body limit, metrics |
| `vault` | Vault | http://localhost:8200 (dev-root-token) | `vault-seed` writes random `SESSION_SECRET`, `JWT_SECRET`, `HMAC_CLIENTS`; the app loads them at boot |
| `observability` | Prometheus, Grafana, Loki, Tempo, Alloy | http://localhost:3000 (admin/admin) | dashboard "API overview": rate, p95 latency, status classes, event-loop lag, logs; traces in Tempo |
| `mail` | Mailpit | http://localhost:8025 | the welcome email sent when a user is created |

Try OAuth2 machine-to-machine:

```sh
TOKEN=$(curl -s --cacert certs/ca.crt https://keycloak.localhost:8543/realms/demo/protocol/openid-connect/token   -d grant_type=client_credentials -d client_id=api-client -d client_secret=dev-api-secret-change-me | jq -r .access_token)
curl --cacert certs/ca.crt -H "Authorization: Bearer $TOKEN" https://localhost/api/v1/secure/oauth2
```

Everything in `deploy/` is development configuration: fixed demo passwords, Vault in dev mode, and Alloy reading the Docker socket. Keep the shape, replace the secrets.

### From GitHub Container Registry

```sh
echo <YOUR_PAT_TOKEN> | docker login ghcr.io -u <USERNAME> --password-stdin

docker run -d -p 443:8443 \
    -v "$PWD/certs:/app/certs:ro" \
    -e SESSION_SECRET="<32+ random characters>" \
    -e JWT_SECRET="<32+ random characters>" \
    -e DB_TYPE=postgres -e DB_URL="postgres://app:app@db:5432/app" \
    -e CACHE_TYPE=redis -e CACHE_URL="redis://cache:6379" \
    ghcr.io/mkabumattar/express-boilerplate:latest
```

The PAT needs the `read:packages` scope. Create one [here](https://github.com/settings/tokens).

## Git Strategy

### Branches

- `main`: Reflects the production-ready state of the source code.
- `develop`: Contains the latest delivered changes for the next release.

### Workflow

1. Create a new branch from `main` for each feature or bug fix.
   - Use descriptive branch names with a prefix (e.g., `feat/`, `fix/`).
2. Make changes and commit them.
   - Follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.
   - Write descriptive commit messages.
3. Push the branch to the remote repository.
4. Create a pull request to merge the branch into `develop`.
5. After approval, merge the pull request into `develop`.
6. Create a pull request to merge `develop` into `main`.
7. After approval, merge the pull request into `main`.

### Semantic Commit Messages and Versioning

This project adheres to [Semantic Versioning](https://semver.org/) and uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to manage releases. Every commit message and version change should follow this standard:

- **fix**: Patches a bug in your codebase (`PATCH` release) or a hotfix.

  ```sh
  git commit -m "fix(api): fix health check route"
  ```
- **feat**: Introduces a new feature (`MINOR` release) or enhancement.

  ```sh
  git commit -m "feat(api): add user route"
  ```
- **BREAKING CHANGE**: Introduces breaking changes (`MAJOR` release) that require a manual update.

  ```sh
  git commit -m "feat!(api): change user route to use UUID"
  ```
- **chore**: Updates dependencies, refactors code, or makes other changes that don't affect the user-facing code.

  ```sh
  git commit -m "chore: update dependencies"
  ```
- **docs**: Updates documentation, README, or other non-code files.

  ```sh
  git commit -m "docs: update README"
  ```
- **ci**: Updates CI/CD configurations or workflows.

  ```sh
  git commit -m "ci: add GitHub Actions workflow"
  ```

## GitHub Environments

GitHub environments empower you to manage deployment settings and configure workflows in GitHub Actions more effectively. This feature enhances the security, control, and visibility of your CI/CD pipeline. Below, you'll find a step-by-step guide to setting up environments and securely managing secrets, such as `PAT_TOKEN`, for Docker image builds.

### Why Use GitHub Environments?

Using GitHub Environments offers several advantages:

- **Security**: Secrets stored in environments are encrypted, ensuring that sensitive information is only accessible to workflows running within those environments.
- **Controlled Deployments**: You can enforce rules for approval before deployments, ensuring that changes are reviewed before going live.
- **Environment-Specific Settings**: Manage different configurations tailored for development, staging, and production, reducing the risk of errors during deployment.

### Setting Up GitHub Environments

Follow these steps to set up GitHub Environments for your project:

1. **Navigate to Your Repository**:
   - Open your web browser and go to your GitHub repository.

2. **Access Environment Settings**:
   - Click on the **Settings** tab at the top of the repository page.
   - In the left sidebar, find and select **Environments** under the **Security** section.

3. **Create a New Environment**:
   - Click the **New environment** button.
   - Provide a meaningful name for your environment (e.g., `development`, `staging`, `production`) to indicate its purpose.
   - (Optional) Configure specific rules, such as requiring manual approval for deployment, to enhance control over the process.

4. **Add Secrets to Your Environment**:
   - After creating your environment, click on its name to access its settings.
   - In the **Secrets** section, click on **Add secret**.
   - Enter `PAT_TOKEN` as the secret name and paste your Personal Access Token into the value field.
   - Click **Add secret** to save the secret securely.

### Using Secrets in Your Workflow

To utilize the `PAT_TOKEN` secret in your GitHub Actions workflow for building Docker images, reference the secret using the syntax shown in the example workflow below. You can find this configuration in your [docker-image.yml](.github/workflows/docker-image.yml) file:

```yaml
name: Docker Image CI

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  build:
    runs-on: ubuntu-latest
    environment: development # Specify the environment

    steps:
      - uses: actions/checkout@v4

      # Log in to the GitHub Container Registry only on main branch pushes
      - name: Login to GitHub Container Registry
        if: github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.PAT_TOKEN }}

      # Add additional steps here (e.g., building and pushing the Docker image)
```

### Best Practices for Managing GitHub Environments

- **Limit Access**: Only grant access to environments to those who require it. Utilize branch protection rules to ensure that only specific users can deploy to production.
- **Review Approvals**: For sensitive environments, set up an approval process to require reviews before deployments occur. This adds a layer of safety to your deployment strategy.
- **Monitor Usage**: Regularly review and audit your environment settings and secrets to ensure compliance with best practices and security policies.

By following these guidelines, you can establish a robust and secure CI/CD process that enhances your development workflow while maintaining best practices for managing sensitive information.


## Contributing

Contributions are welcome! Please follow the guidelines in [CONTRIBUTING.md](.github/CONTRIBUTING.md). If you don't have this file, consider creating one with instructions for how to fork the project, make changes, and submit pull requests.

### Additional Guidelines

- Follow the coding style outlined in the `Biome` configuration files.
- Use the PR template provided in the `.github` folder to ensure all necessary details are included when submitting a pull request.
- Report issues using the provided issue template.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details by [@MKAbuMattar](https://github.com/MKAbuMattar).


## Further reading

- [Express 5](https://expressjs.com/)
- [InversifyJS HTTP](https://inversify.io/framework/)
- [TypeORM](https://typeorm.io/)
- [jose](https://github.com/panva/jose), [openid-client](https://github.com/panva/openid-client), [node-saml](https://github.com/node-saml/node-saml)
- [node-redis](https://github.com/redis/node-redis)
- [Pino](https://getpino.io/), [Vitest](https://vitest.dev/), [Biome](https://biomejs.dev/)
