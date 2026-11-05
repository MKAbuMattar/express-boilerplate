# AGENTS.md

Instructions for AI coding agents working in this repo. `CLAUDE.md`, `GEMINI.md` and `.cursor/rules/` all point here; edit this file only.

## Stack

Node 26, pnpm 12, TypeScript 7, Express 5, Inversify 8, TypeORM 1, Vitest 5, Biome 2. A pnpm workspace run by Turborepo.

## Commands

Run from the repo root.

```sh
pnpm install
pnpm dev          # all packages in watch mode, API on https://localhost (443)
pnpm lint         # Biome; pnpm lint:fix to fix
pnpm typecheck
pnpm build
pnpm test         # every Vitest project; pnpm test:unit, test:integration, test:security, ...
pnpm certs        # local CA and certs in apps/api/certs (needed once)
```

A change is done when `pnpm lint`, `pnpm typecheck` and `pnpm test` pass. Container tests skip without Docker; say so if you could not run them.

## Layout and layers

| Package | Holds | May import |
|---|---|---|
| `apps/api` | Controllers, REST resources, request DTOs, middleware, transports, composition root | service, common |
| `packages/service` | Service contracts and implementations | persistence, common |
| `packages/persistence` | Entities, repositories, migrations, DataSource | common |
| `packages/common` | Config, DI, security, errors, cache, queues, observability | nothing in the workspace |

- Never import upward. pnpm and the package dependencies enforce it; do not add a workspace dependency to get around it.
- `apps/api` must not import `@express-boilerplate/persistence`, except entity types in converters and `application.ts`. A Biome rule fails otherwise.
- Only `persistence` depends on `typeorm`. Import `DataSource` from `@express-boilerplate/persistence/config/database.config.js`, never from `typeorm`, or DI tokens stop matching.
- Cross-package imports use the full path with `.js`: `@express-boilerplate/common/config/app.config.js`. Packages are consumed from `dist/`, so a change in a package needs its build (`pnpm dev` and `turbo` handle it).
- Folder names inside every package: config, constant, controller, converter, enumeration, exceptions, model, repository, rest, security, service (+ `impl/`), util. Put new files in the matching folder.
- Each package README says how to add an endpoint, a service or a migration. Follow it.

## Code rules

- Everything is a class, including static-only helpers. No top-level functions.
- No namespace imports: never `import * as x` or `import type * as x`.
- A service is an abstract class (the DI token) plus a `@Service()` implementation in `impl/`, bound with `@Bean(Token)` in that package's `@Configuration` class.
- Constructor parameters always use `@inject(Token)`, and `@Bean` always names its token: esbuild (tsx, Vitest) emits no type metadata.
- Errors to clients are RFC 9457 problem details. Do not hand-write error JSON.
- No vendor or framework names (Spring, Spring Boot, `vnd.*` media types) in code, docs or responses.
- Comments explain why, not what.

## Security rules

- One listener: TLS on port 443. Never add a plaintext HTTP listener, a second port, or a non-TLS transport. New protocols share 443 through ALPN (see `TcpServer`).
- Every outgoing connection is encrypted: `DB_TLS`, `rediss://`, `smtps://`, `https://`. `AppConfig` enforces this in staging and production; keep that check passing.
- Every route needs a guard and `Scopes.require(...)` unless it is public on purpose. The route audit test lists the public ones.
- Swagger (`/docs`) is development only.
- Never commit or print `.env`, `apps/api/certs/`, `*.key` or `*.pem`. Secrets come from the environment or Vault.

## Tests

Tests live in `apps/api/test/<type>/` (unit, integration, e2e, security, monkey, chaos, containers) and run against a real TLS server. Add or update a test with every behavior change. Use `TestApp.create()` and `RawHttp.listen()` from `test/support/`.

## Commits

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), imperative title under 72 characters, body says why. No co-author or "generated with" trailers. Do not push or open pull requests unless asked.
