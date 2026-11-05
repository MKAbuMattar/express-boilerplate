import {DataSource, type DataSourceOptions} from 'typeorm';
import {DatabaseType} from '../enumeration/database-type.enum.js';
import {CreateUsersTable1793900000000} from '../migration/1793900000000-create-users-table.js';
import {AddUserPhone1793900000001} from '../migration/1793900000001-add-user-phone.js';
import {UserEntity} from '../model/user.entity.js';
import type {AppConfig} from './app.config.js';

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
    const {DB_TYPE, DB_URL, DB_SYNCHRONIZE, DB_MIGRATIONS_RUN} = config.env;
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
        return {...common, type: 'mssql', url: DatabaseConfig.url(DB_URL)};
      case DatabaseType.Mongodb:
        return {...common, type: 'mongodb', url: DatabaseConfig.url(DB_URL)};
      default:
        return {...common, type: DB_TYPE, url: DatabaseConfig.url(DB_URL)};
    }
  }

  private static url(value: string): string {
    if (!value) throw new Error('DB_URL is required for this DB_TYPE');
    return value;
  }
}
