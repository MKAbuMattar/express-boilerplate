import {readFileSync} from 'node:fs';
import {DataSource, type DataSourceOptions} from 'typeorm';

/** The one TypeORM instance: other layers import DataSource from here. */
export {DataSource};

import type {AppConfig} from '@express-boilerplate/common/config/app.config.js';
import {DatabaseType} from '@express-boilerplate/common/enumeration/database-type.enum.js';
import {UserEntity} from '../model/user.entity.js';
import {CreateUsersTable1793900000000} from '../repository/migration/1793900000000-create-users-table.js';
import {AddUserPhone1793900000001} from '../repository/migration/1793900000001-add-user-phone.js';

export class DatabaseConfig {
  static readonly entities = [UserEntity];
  /** In order. Add new schema changes at the end; never edit a shipped one. */
  static readonly migrations = [
    CreateUsersTable1793900000000,
    AddUserPhone1793900000001,
  ];

  static createDataSource(config: AppConfig): DataSource {
    return new DataSource(DatabaseConfig.options(config));
  }

  static options(config: AppConfig): DataSourceOptions {
    const {DB_TYPE, DB_URL, DB_SYNCHRONIZE, DB_MIGRATIONS_RUN, DB_TLS} =
      config.env;
    const ca = config.env.DB_TLS_CA_FILE
      ? readFileSync(config.env.DB_TLS_CA_FILE)
      : undefined;
    const isMongo = DB_TYPE === DatabaseType.Mongodb;
    const common = {
      entities: DatabaseConfig.entities,
      // MongoDB is schemaless, so it has no migrations to run.
      migrations: isMongo ? [] : DatabaseConfig.migrations,
      migrationsRun: !isMongo && DB_MIGRATIONS_RUN,
      migrationsTableName: 'schema_migrations',
      synchronize: DB_SYNCHRONIZE,
    };

    switch (DB_TYPE) {
      case DatabaseType.Sqljs:
        // In-memory unless DB_URL names a file. For local dev and tests.
        return DB_URL
          ? {...common, type: 'sqljs', location: DB_URL, autoSave: true}
          : {...common, type: 'sqljs'};
      case DatabaseType.Mssql:
        return {
          ...common,
          type: 'mssql',
          url: DatabaseConfig.url(DB_URL),
          ...(DB_TLS && {
            options: {encrypt: true, trustServerCertificate: false},
          }),
        };
      case DatabaseType.Mongodb:
        return {
          ...common,
          type: 'mongodb',
          url: DatabaseConfig.url(DB_URL),
          ...(DB_TLS && {
            tls: true,
            tlsCAFile: config.env.DB_TLS_CA_FILE || undefined,
          }),
        };
      default:
        // Verified TLS: the server cert must chain to a trusted CA.
        return {
          ...common,
          type: DB_TYPE,
          url: DatabaseConfig.url(DB_URL),
          ...(DB_TLS && {ssl: {rejectUnauthorized: true, ca}}),
        };
    }
  }

  private static url(value: string): string {
    if (!value) throw new Error('DB_URL is required for this DB_TYPE');
    return value;
  }
}
