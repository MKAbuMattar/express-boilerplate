# @express-boilerplate/persistence

Data access: TypeORM entities, repositories, schema migrations and the database connection. This is the only package that depends on TypeORM and the database drivers, so the whole app shares one `DataSource` class. Other packages import it from `@express-boilerplate/persistence/config/database.config.js`, never from `typeorm`.

Depends on `@express-boilerplate/common`. `@express-boilerplate/service` uses it. The API package does not, except to register its beans.

## Databases

`DB_TYPE` picks one: `postgres`, `mysql`, `mariadb`, `mssql`, `mongodb`, or `sqljs` (in-process, for local development and tests).

`DB_TLS=true` turns on verified TLS. The server certificate must chain to a trusted CA; set `DB_TLS_CA_FILE` for a private CA. In staging and production the app refuses to start without it, except for `sqljs`, which has no network connection.

## Layout

```
src/
├── config/database.config.ts        DataSource options per DB_TYPE, TLS, migration list
├── config/persistence.configuration.ts  @Bean(DataSource)
├── config/cli.data-source.ts        DataSource for the TypeORM CLI
├── model/user.entity.ts             UserEntity
└── repository/
    ├── user.repository.ts           UserRepository
    └── migration/                   one class per schema change
```

## Migrations

Migrations use TypeORM's schema builder, so one migration runs on every SQL database. MongoDB is schemaless and skips them. They run at startup when `DB_MIGRATIONS_RUN=true`, and are recorded in `schema_migrations`. `synchronize` is off.

```sh
pnpm migration:show
pnpm migration:run
pnpm migration:revert
pnpm --filter @express-boilerplate/persistence migration:create src/repository/migration/AddX
```

After creating one, add it to the end of `DatabaseConfig.migrations`. `pnpm eb generate resource <name>` writes an entity, repository and migration and registers both. Never edit a migration that has shipped; add a new one. In Kubernetes, the Helm chart runs `migration:prod` as a Job before the new pods start.

## Scripts

`build`, `typecheck`, and the `migration:*` scripts above. They read `apps/api/.env.development` and `apps/api/.env`.
