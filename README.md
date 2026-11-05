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
| `pnpm test:<type>` | One type: `unit`, `integration`, `containers`, `e2e`, `monkey`, `chaos` |
| `pnpm test:cov` | Coverage for unit and integration |
| `pnpm lint` / `pnpm lint:fix` | Biome |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm certs [dir] [--force]` | Generate local TLS and mTLS certs |
| `pnpm jwt [subject] [ttl]` | Print a dev JWT signed with `JWT_SECRET` |

## Project structure

Layered like a Spring Boot application. Every unit is a class.

```
src/
├── main.ts                  Main: starts the HTTPS (or HTTP) server, graceful shutdown
├── application.ts           Application: builds the container and the Express app
├── config/                  AppConfig (env), AppConfiguration (@Bean methods), BeanFactory,
│   │                        stereotypes, DatabaseConfig, TlsConfig
│   └── cache/               CacheStore, MemoryCacheStore, RedisCacheStore
├── constant/                ApiConstants (routes), SecurityConstants, CacheConstants
├── controller/              AuthenticationController (OIDC and SAML login flows)
├── converter/               UserConverter (entity to DTO)
├── enumeration/             AuthStrategy, DatabaseType, CacheType
├── exceptions/              AuthException, GlobalExceptionFilter
├── model/                   UserEntity (TypeORM)
├── repository/              UserRepository
├── rest/
│   ├── dto/                 ApiResponse, CreateUserDto (validates input), UserDto
│   └── resources/           HealthV1Resource, UserV1Resource, SecureV1Resource
├── security/
│   ├── principal.ts         Principal set on the request by every guard
│   ├── hmac/  jwt/  mtls/  oauth2/  sso/
├── service/                 UserService, CacheService (abstract contracts)
│   └── impl/                UserServiceImpl, CacheServiceImpl
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
| `monkey` | `test/monkey/` | 1500 random methods, paths, headers and bodies (fast-check). No unexpected 5xx, always JSON, still healthy afterwards. |
| `chaos` | `test/chaos/` | Dependencies fail on purpose: database down (503, then recovers), cache down or hanging (requests still succeed), cache down for HMAC (503, fails closed), IdP down (503), JWKS down (401), a flaky repository, 300 concurrent requests |

What the chaos tests pin down:

- **Cache reads and writes fail open.** A cache error or a call slower than `CACHE_TIMEOUT_MS` (default 200) counts as a miss.
- **The HMAC replay check fails closed** with 503, so a cache outage never lets a replayed request through.
- **An unreachable database answers 503**, not 500, so load balancers and clients retry.

## Docker

```sh
pnpm certs
docker compose up --build                                   # app on https://localhost
docker compose --profile postgres --profile redis up --build
```

Profiles: `postgres`, `mysql`, `mariadb`, `mongodb`, `redis`, `valkey`. The image runs as the non-root `node` user on port 8443, published as 443. Certs are mounted read-only at `/app/certs`, and secrets come from the environment, never from build args. To pull the base image from AWS ECR Public:

```sh
docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:26-alpine .
```

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
