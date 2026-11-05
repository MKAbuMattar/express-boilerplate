import {DataSource, type DataSourceOptions} from 'typeorm';
import {DatabaseType} from '../enumeration/database-type.enum.js';
import {UserEntity} from '../model/user.entity.js';
import type {AppConfig} from './app.config.js';

export class DatabaseConfig {
  static readonly entities = [UserEntity];

  static createDataSource(config: AppConfig): DataSource {
    return new DataSource(DatabaseConfig.options(config));
  }

  static options(config: AppConfig): DataSourceOptions {
    const {DB_TYPE, DB_URL, DB_SYNCHRONIZE} = config.env;
    const common = {
      entities: DatabaseConfig.entities,
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
