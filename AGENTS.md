# AGENTS.md

Instructions for AI coding agents working in this repo. `CLAUDE.md`, `GEMINI.md` and `.cursor/rules/` all point here; edit this file only.

## Stack

Node 26, pnpm 12, TypeScript 7, Express 5, Inversify 8, TypeORM 1, Vitest 5, Biome 2. A pnpm workspace run by Turborepo.

## Commands

Run from the repo root.

```sh
pnpm install
pnpm dev          # API on https://api.express-boilerplate.len (443), packages from source
pnpm lint         # Biome; pnpm lint:fix to fix
pnpm typecheck
pnpm build
pnpm test         # every Vitest project; pnpm test:unit, test:integration, test:security, ...
pnpm certs        # local CA + *.express-boilerplate.len cert in apps/api/certs (needed once)
pnpm eb create ../x --preset minimal   # generate a project (see packages/cli)
pnpm eb generate resource order --fields title:string,total:int
```

A change is done when `pnpm lint`, `pnpm typecheck` and `pnpm test` pass. Container tests skip without Docker; say so if you could not run them.

## Layout and layers

| Package                | Holds                                                                               | May import               |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| `apps/api`             | Controllers, REST resources, request DTOs, middleware, transports, composition root | service, common          |
| `packages/service`     | Service contracts and implementations                                               | persistence, common      |
| `packages/persistence` | Entities, repositories, migrations, DataSource                                      | common                   |
| `packages/common`      | Config, DI, security, errors, cache, queues, observability                          | nothing in the workspace |
| `packages/cli`         | `create-expresso-api` / `eb`: project generator and resource scaffolding            | nothing in the workspace |

- Never import upward. pnpm and the package dependencies enforce it; do not add a workspace dependency to get around it.
- `apps/api` must not import `@express-boilerplate/persistence`, except entity types in converters and `application.ts`. A Biome rule fails otherwise.
- Only `persistence` depends on `typeorm`. Import `DataSource` from `@express-boilerplate/persistence/config/database.config.js`, never from `typeorm`, or DI tokens stop matching.
- Cross-package imports use the full path with `.js`: `@express-boilerplate/common/config/app.config.js`. Dev, tests and the API typecheck load packages from `src/` (the `source` export condition); `pnpm build` and production use `dist/`.
- Folder names inside every package: config, constant, controller, converter, enumeration, exceptions, model, repository, rest, security, service (+ `impl/`), util. Put new files in the matching folder.
- Each package README says how to add an endpoint, a service or a migration. Follow it.
- `docs/` explains the whole repo for people (setup, generator, compose, Kubernetes, architecture). When you change behavior it describes, update the page. Diagrams are `docs/diagrams/*.drawio`; re-export the SVG after editing one.

## Code rules

- Everything is a class, including static-only helpers. No top-level functions.
- No namespace imports: never `import * as x` or `import type * as x`.
- A service is an abstract class (the DI token) plus a `@Service()` implementation in `impl/`, bound with `@Bean(Token)` in that package's `@Configuration` class.
- Constructor parameters always use `@inject(Token)`, and `@Bean` always names its token: esbuild (tsx, Vitest) emits no type metadata.
- Errors to clients are RFC 9457 problem details. Do not hand-write error JSON.
- Services throw domain errors (`NotFoundException`, `ConflictException`, `ValidationException` from `common/exceptions/domain.exception.js`), never HTTP responses. `GlobalExceptionFilter` maps them.
- No vendor or framework names (Spring, Spring Boot, `vnd.*` media types) in code, docs or responses.
- Comments explain why, not what.

## Security rules

- One listener: TLS on port 443. Never add a plaintext HTTP listener, a second port, or a non-TLS transport. New protocols share 443 through ALPN (see `TcpServer`).
- Two APISIX gateways: public (`api`, login pages; 127.0.0.1:443) and private (operator tools; 127.0.0.2:443), each with its own control plane and etcd prefix. Compose publishes nothing else except databases. A user-facing host goes in the public resources of `deploy/apisix/seed.mjs` and `LocalCertificateGenerator.PUBLIC_HOSTS`; a tool goes in `TOOLS` and `PRIVATE_HOSTS`. Never route a tool on the public gateway.
- The gateways never answer with a stock page: errors they produce are problem details (`deploy/apisix/config-dp.yaml`, `deploy/k8s/apisix/values.yaml`), and unrouted requests hit the catch-all 404. Keep both files in step.
- Every outgoing connection is encrypted: `DB_TLS`, `rediss://`, `smtps://`, `https://`. `AppConfig` enforces this in staging and production; keep that check passing.
- Every route needs a guard and `Scopes.require(...)` unless it is public on purpose. The route audit test lists the public ones.
- Swagger (`/docs`) is development only.
- Client certificates are all or nothing: `TLS_CLIENT_AUTH=none` or `require`. Never add an optional handshake (`rejectUnauthorized: false`); code scanning blocks it.
- Never commit or print `.env`, `apps/api/certs/`, `*.key` or `*.pem`. Secrets come from the environment or Vault.

## Optional features (the generator)

`pnpm eb create` builds projects with a subset of features, so the template must stay cuttable:

- Code that belongs to one optional feature goes in a file listed under that feature's `remove` in `boilerplate.features.json`, or between `// @feature:<id>` and `// @end:<id>` comment lines (`#` in YAML and env files). Tests and env entries too.
- Removing a block must leave valid code: no unused variable, parameter or private member. When it would, add a `// @feature:!<id>` fallback with `//~`-commented lines.
- A new optional feature gets a manifest entry (id, title, group, remove, dependencies, requires).
- After touching markers, check `pnpm eb create <tmp> --preset minimal` and `--preset full` pass `pnpm lint && pnpm typecheck && pnpm test`. CI runs both.

## Tests

Tests live in `apps/api/test/<type>/` (unit, integration, e2e, security, monkey, chaos, containers) and run against a real TLS server. Add or update a test with every behavior change. Use `TestApp.create()` and `RawHttp.listen()` from `test/support/`. The CLI is the exception: its tests live in `packages/cli/test/unit/`, one file per class.

## Commits

Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), imperative title under 72 characters, body says why. Pull request titles are checked by `pr-title.yml` and may only use `feat`, `fix`, `docs`, `ci` or `chore`. No co-author or "generated with" trailers. Do not push or open pull requests unless asked.
