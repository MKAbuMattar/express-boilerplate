# @express-boilerplate/common

Shared infrastructure that every package uses: configuration, dependency injection, security, error responses, cache, queues, logging and observability. It has no business logic and depends on no other workspace package.

## Contents

| Folder                      | What                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/`                   | `AppConfig` (validated environment, including the encrypted-transit check), `BeanFactory` with `@Configuration` and `@Bean`, stereotypes (`@Component`, `@Service`, `@Repository`), `TlsConfig`, `ServerHardening`, `VaultSecrets`, `CommonConfiguration` |
| `config/cache/`             | `CacheStore`: in-memory, or Redis/Valkey/ElastiCache over `rediss://`                                                                                                                                                                                     |
| `config/queue/`             | `QueueBroker`: in-memory, or BullMQ with retries and a dead-letter queue                                                                                                                                                                                  |
| `config/observability/`     | Prometheus `Metrics`, OpenTelemetry `Tracing`                                                                                                                                                                                                             |
| `security/`                 | `Principal`, `Scopes`, and the guards: mTLS, HMAC, JWT (`TokenProvider` with key rotation and revocation), OAuth2, SSO (OIDC with PKCE, SAML, sessions)                                                                                                   |
| `exceptions/`               | `AuthException`, `ProblemDetails` (RFC 9457)                                                                                                                                                                                                              |
| `rest/dto/`                 | `ApiResponse`, the response envelope                                                                                                                                                                                                                      |
| `service/`                  | `CacheService` and its implementation                                                                                                                                                                                                                     |
| `constant/`, `enumeration/` | Route paths, scopes, security limits; auth strategy, database and cache types, health status                                                                                                                                                              |
| `util/`                     | `AppLogger` (pino), `@Cacheable` and `@CacheEvict`                                                                                                                                                                                                        |

## Configuration

`AppConfig` reads and validates every environment variable once at startup. Bad values stop the process with the full list of problems. In `staging` and `production` it also requires encryption on every outgoing connection:

- `DB_TLS=true`
- `rediss://` for the cache and queue
- `smtps://` for mail
- `https://` for Vault, the OTLP exporter and identity providers

`apps/api/.env.example` lists every setting.

## Beans

`CommonConfiguration` provides the logger, cache store, queue broker, cache service and metrics. Classes marked `@Component()`, `@Service()` or `@Repository()` are built by the container, and constructor parameters use `@inject(Token)`.

## Scripts

`build` (to `dist/`), `typecheck`. Dev and tests load `src/` through the `source` export condition; builds and production use `dist/`. Other packages import by path, for example `@express-boilerplate/common/config/app.config.js`.
